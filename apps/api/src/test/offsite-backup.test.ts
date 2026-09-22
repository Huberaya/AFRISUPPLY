// Chantier 13 (audit n°3) — SAUVEGARDE HORS SITE.
//
// Le défaut mesuré par l'audit : les sauvegardes s'écrivaient uniquement sur le disque de la machine
// qui les produisait. En serverless ce disque est éphémère : la sauvegarde disparaît avec l'instance.
// Une sauvegarde qui vit à côté de la base qu'elle protège ne protège de rien.
//
// Ce que ces tests verrouillent, avec un faux service S3 qui VÉRIFIE la signature des requêtes :
//   1. sans configuration, tout répond « non configuré » en nommant les variables manquantes — et
//      rien n'est jamais présenté comme réussi ;
//   2. une sauvegarde est envoyée, puis RELUE, et son empreinte SHA-256 comparée ;
//   3. une copie altérée est détectée ET supprimée : pas de copie vaut mieux qu'une copie fausse ;
//   4. un refus du service (droits) est signalé comme un échec, avec la cause lisible ;
//   5. un service injoignable est signalé comme un échec, jamais comme un succès ;
//   6. la rétention distante ne supprime que si une copie PLUS RÉCENTE du même restaurant existe
//      hors site — le disque local n'est jamais consulté pour décider d'une suppression ;
//   7. l'essai de restauration part de la copie EXTERNE, la recharge dans une base neuve et jetable,
//      et c'est une vraie preuve : les lignes se retrouvent dans la base ;
//   8. l'état du hors site dit la vérité (nombre d'objets, octets, date du dernier envoi).
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PGLITE_DIR = 'memory://chantier13';
process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
process.env.CRON_SECRET = 'cron';
process.env.VENDOR_AUTO_APPROVE = 'true';
delete process.env.RESEND_API_KEY;
delete process.env.VERCEL;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { runMigrations, getDb, jobRuns } from '@afrisupply/db';
import { app } from '../app.js';
import { exportRestaurant, writeBackupFile, backupDir } from '../lib/backup.js';
import {
  offsiteConfig, offsiteKey, offsiteSweep, offsiteStats, offsiteDrill, uploadFile, downloadBackup,
  listObjects, pruneOffsite, putObject, getObject,
} from '../lib/offsite.js';
import { demarrerFauxS3, configurerFauxS3, journalS3, type FauxS3 } from './faux-s3.js';

type Json = Record<string, unknown>;
const call = async (m: string, p: string, body?: unknown, h: Record<string, string> = {}) => {
  const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.clone().json().catch(() => ({}))) as Json };
};

let A: Record<string, string>;   // en-têtes du propriétaire
let rid = '';
let s3: FauxS3;
let reparerEnv: () => void;
const dossierLocal = mkdtempSync(path.join(tmpdir(), 'afs-backups-13-'));

const VARS = ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY', 'BACKUP_S3_PREFIX', 'BACKUP_S3_KEEP'];

beforeAll(async () => {
  await runMigrations();
  const reg = await call('POST', '/api/auth/register', {
    email: 'hors-site@resto.fr', password: 'Plantain-Yassa-42', fullName: 'Awa Hors Site',
    restaurantName: 'Chez Awa Hors Site', city: 'Nantes',
  });
  const j = reg.json as { token: string; restaurant: { id: string } };
  rid = j.restaurant.id;
  A = { authorization: `Bearer ${j.token}`, 'x-restaurant-id': rid };
  // De la matière réelle à sauvegarder : le parcours d'un nouveau restaurant (modèles → stock),
  // puis un fournisseur, une offre et une commande. C'est ce qu'on veut retrouver après sinistre.
  const modeles = await call('GET', '/api/onboarding/templates', undefined, A);
  await call('POST', '/api/onboarding/apply', { templates: [(modeles.json.templates as { name: string }[])[0].name] }, A);
  const stock = await call('GET', '/api/stock', undefined, A);
  const pid = (stock.json.items as { productId: string }[])[0].productId;
  const sup = await call('POST', '/api/suppliers', { name: 'Gros Hors Site', contactName: 'Ali', phone: '06 11 22 33 44', leadTimeHours: 24 }, A);
  const sid = ((sup.json as { supplier?: { id: string } }).supplier?.id ?? (sup.json as { id: string }).id);
  const offre = await call('POST', `/api/suppliers/${sid}/offers`, { productId: pid, packLabel: 'Sac 25 kg', packQty: 25, packPrice: 40 }, A);
  const oid = ((offre.json as { offer?: { id: string } }).offer?.id ?? (offre.json as { id: string }).id);
  const ord = await call('POST', '/api/orders', { supplierId: sid, channel: 'whatsapp', lines: [{ offerId: oid, packs: 2 }] }, A);
  expect(ord.status, JSON.stringify(ord.json)).toBe(201);
  s3 = await demarrerFauxS3();
}, 120_000);

afterAll(async () => {
  reparerEnv?.();
  await s3?.arreter();
  rmSync(dossierLocal, { recursive: true, force: true });
});

/** Produit une vraie sauvegarde locale (avec ses données) dans un dossier donné. */
async function sauvegardeLocale(dir: string, opts: { quand?: Date } = {}) {
  const backup = await exportRestaurant(rid, { mode: 'admin' });
  // L'horodatage est dans le nom : on le décale pour simuler plusieurs sauvegardes successives.
  const meta = await writeBackupFile(backup, dir);
  if (opts.quand) {
    const ancien = path.join(dir, meta.name);
    const faux = new Date(opts.quand).toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const nouveau = meta.name.replace(/\d{8}T\d{6,7}/, faux);
    const { renameSync } = await import('node:fs');
    renameSync(ancien, path.join(dir, nouveau));
    renameSync(`${ancien}.meta.json`, path.join(dir, `${nouveau}.meta.json`));
    return { ...meta, name: nouveau };
  }
  return meta;
}

describe('1. Sans configuration : jamais de succès simulé', () => {
  it('dit exactement ce qui manque et n’envoie rien', async () => {
    for (const v of VARS) delete process.env[v];
    const cfg = offsiteConfig();
    expect(cfg.configured).toBe(false);
    expect(cfg.missing).toEqual(expect.arrayContaining(['BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY']));
    expect(cfg.why).toMatch(/NON configurée/);
    expect(cfg.why).toMatch(/BACKUP_S3_ENDPOINT/);

    const envoi = await uploadFile('afs-aaaaaaaa-20260101T000000-admin.json.gz', dossierLocal);
    expect(envoi.ok).toBe(false); expect(envoi.verified).toBe(false); expect(envoi.error).toMatch(/BACKUP_S3_/);

    const balayage = await offsiteSweep({ names: ['afs-aaaaaaaa-20260101T000000-admin.json.gz'], dir: dossierLocal });
    expect(balayage.ok).toBe(false); expect(balayage.configured).toBe(false); expect(balayage.uploaded).toHaveLength(0);

    const stats = await offsiteStats();
    expect(stats.configured).toBe(false); expect(stats.objects).toBe(0); expect(stats.lastUploadAt).toBeNull();

    const essai = await offsiteDrill('afs-aaaaaaaa-20260101T000000-admin.json.gz', { dir: dossierLocal });
    expect(essai.ok).toBe(false); expect(essai.error).toMatch(/BACKUP_S3_/);
  });
});

describe('2. Envoi, relecture et empreinte', () => {
  it('dépose la sauvegarde hors site, la relit et compare le SHA-256', async () => {
    reparerEnv = configurerFauxS3(s3, { prefix: 'afrisupply/backups' });
    const meta = await sauvegardeLocale(dossierLocal);
    const res = await offsiteSweep({ names: [meta.name], dir: dossierLocal, prune: false });

    expect(res.configured).toBe(true);
    expect(res.failed, `${JSON.stringify(res.failed)} · ${journalS3(s3)}`).toHaveLength(0);
    expect(res.uploaded.length).toBeGreaterThanOrEqual(1);
    expect(res.uploaded[0].verified).toBe(true);

    // La copie est réellement dans le service, à la clé attendue, et la fiche lisible a suivi.
    const cle = offsiteKey(meta.name);
    expect(s3.objets.has(cle)).toBe(true);
    expect(s3.objets.has(`${cle}.meta.json`)).toBe(true);
    // Le contenu déposé est identique au fichier local (octet pour octet).
    const local = readFileSync(path.join(dossierLocal, meta.name));
    expect(s3.objets.get(cle)!.body.equals(local)).toBe(true);
    // Toutes les requêtes reçues étaient signées : on n'envoie pas une archive de restaurant en clair.
    expect(s3.requetes.every((r) => r.signed), journalS3(s3)).toBe(true);

    // La relecture par le client redonne bien le même objet.
    const relu = await getObject(meta.name);
    expect(relu.ok).toBe(true);
    if (relu.ok) expect(relu.sha256).toBe(createHash('sha256').update(local).digest('hex'));
  });

  it('l’état hors site dit la vérité : objets comptés, octets, date du dernier envoi', async () => {
    const stats = await offsiteStats();
    expect(stats.configured).toBe(true);
    expect(stats.objects).toBeGreaterThanOrEqual(2);
    expect(stats.bytes).toBeGreaterThan(0);
    expect(stats.lastUploadAt).toBeTruthy();
    expect(stats.lastBackupName).toBeTruthy();
    expect(stats.error).toBeUndefined();
  });
});

describe('3. Une copie fausse est détectée et retirée', () => {
  it('altération après écriture → échec signalé, copie supprimée, aucune illusion', async () => {
    const meta = await sauvegardeLocale(dossierLocal);
    s3.altererApresEcriture = true;
    try {
      const res = await uploadFile(meta.name, dossierLocal);
      expect(res.ok).toBe(false);
      expect(res.verified).toBe(false);
      expect(res.supprimeCarAltere).toBe(true);
      expect(res.error).toMatch(/ne correspond pas/);
      // La copie fausse a réellement été retirée du service.
      expect(s3.objets.has(offsiteKey(meta.name))).toBe(false);
    } finally { s3.altererApresEcriture = false; }
  });
});

describe('4. Le service refuse ou ne répond pas', () => {
  it('refus de droits (403) → échec explicite, cause lisible, aucune alerte de succès', async () => {
    const meta = await sauvegardeLocale(dossierLocal);
    s3.refuser = true;
    try {
      const res = await uploadFile(meta.name, dossierLocal);
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/refusé les identifiants|droits d'écriture/);
    } finally { s3.refuser = false; }
  });

  it('service injoignable → échec explicite, jamais un « ok » optimiste', async () => {
    const meta = await sauvegardeLocale(dossierLocal);
    const vraiEndpoint = process.env.BACKUP_S3_ENDPOINT;
    process.env.BACKUP_S3_ENDPOINT = 'http://127.0.0.1:9';   // port fermé : rien n'écoute
    try {
      const res = await uploadFile(meta.name, dossierLocal);
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/injoignable|refus|fetch failed|ECONNREFUSED/i);
    } finally { process.env.BACKUP_S3_ENDPOINT = vraiEndpoint; }
  });

  it('le balayage a lieu même si un envoi échoue : la sauvegarde locale reste, l’échec est nommé', async () => {
    const meta = await sauvegardeLocale(dossierLocal);
    s3.refuser = true;
    try {
      const res = await offsiteSweep({ names: [meta.name], dir: dossierLocal, prune: false });
      expect(res.ok).toBe(false);
      expect(res.failed.length).toBeGreaterThan(0);
      expect(res.error).toMatch(/en échec/);
      // Le fichier local, lui, existe toujours : on n'a rien perdu.
      expect(readFileSync(path.join(dossierLocal, meta.name)).length).toBeGreaterThan(0);
    } finally { s3.refuser = false; }
  });
});

describe('5. Rétention distante : on ne supprime que sur preuve', () => {
  it('garde les N plus récentes par restaurant, et ne touche jamais aux objets étrangers', async () => {
    // Environnement dédié : un seau propre pour ne pas fausser les comptes des autres tests.
    const isole = await demarrerFauxS3({ bucket: 'seau-retention' });
    const reparer = configurerFauxS3(isole, { prefix: 'afrisupply/backups' });
    const dir = mkdtempSync(path.join(tmpdir(), 'afs-retention-'));
    try {
      // Trois sauvegardes du MÊME restaurant (le nom porte l'horodatage) + une du voisin.
      const jours = ['2026-09-01T03:00:00Z', '2026-09-02T03:00:00Z', '2026-09-03T03:00:00Z'];
      const noms: string[] = [];
      for (const j of jours) noms.push((await sauvegardeLocale(dir, { quand: new Date(j) })).name);
      const voisin = `afs-bbbbbbbb-${noms[0].split('-')[1]}-admin.json.gz`;   // autre restaurant, même format
      writeFileSync(path.join(dir, voisin), gzipSync(Buffer.from('{"format":"afrisupply.backup"}')));

      const sweep = await offsiteSweep({ names: [...noms, voisin], dir, prune: true, keep: 2 });
      expect(sweep.failed).toHaveLength(0);

      const restants = [...isole.objets.keys()].map((k) => k.split('/').pop()!).filter((n) => !n.endsWith('.meta.json'));
      // On garde les 2 plus récentes du restaurant principal… et l'objet du voisin, jamais touché.
      expect(restants).toContain(noms[2]);
      expect(restants).toContain(noms[1]);
      expect(restants).not.toContain(noms[0]);
      expect(restants).toContain(voisin);
      // La fiche lisible de la sauvegarde supprimée a disparu avec elle (pas de fiche orpheline).
      expect(isole.objets.has(`afrisupply/backups/${noms[0]}.meta.json`)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); reparer(); await isole.arreter(); }
  });

  it('un disque local vide ne fait pas disparaître l’archive distante', async () => {
    // Cas réel : une instance serverless neuve démarre, son disque est vide, et le job du matin
    // tourne. Si la rétention s'appuyait sur les fichiers locaux, elle croirait qu'il n'y a
    // « rien à garder » — et effacerait l'archive. Ici : seau non vide, dossier local vide.
    const isole = await demarrerFauxS3({ bucket: 'seau-disque-vide' });
    const reparer = configurerFauxS3(isole, { prefix: 'afrisupply/backups' });
    const dirVide = mkdtempSync(path.join(tmpdir(), 'afs-disque-vide-'));
    try {
      const corps = gzipSync(Buffer.from('{"format":"afrisupply.backup"}'));
      await putObject('afs-cccccccc-20260901T030000-admin.json.gz', corps);
      await putObject('afs-cccccccc-20260902T030000-admin.json.gz', corps);

      const res = await pruneOffsite(5);   // on garde 5 : rien ne doit partir
      expect(res.ok).toBe(true);
      expect(res.removed).toHaveLength(0);
      const liste = await listObjects();
      expect(liste.objects).toHaveLength(2);

      // Et avec une limite plus basse, il supprime bien le plus ancien — pas le plus récent.
      const res2 = await pruneOffsite(1);
      expect(res2.removed).toEqual(['afs-cccccccc-20260901T030000-admin.json.gz']);
      const restants = [...isole.objets.keys()];
      expect(restants).toEqual(['afrisupply/backups/afs-cccccccc-20260902T030000-admin.json.gz']);
    } finally { rmSync(dirVide, { recursive: true, force: true }); reparer(); await isole.arreter(); }
  });
});

describe('6. Restauration depuis la copie EXTERNE (la preuve)', () => {
  it('télécharge la copie hors site, la vérifie, la recharge dans une base neuve et y retrouve les lignes', async () => {
    // 1. Une sauvegarde fraîche part hors site.
    const meta = await sauvegardeLocale(dossierLocal);
    const sweep = await offsiteSweep({ names: [meta.name], dir: dossierLocal, prune: false });
    expect(sweep.uploaded[0].verified).toBe(true);

    // 2. On fait comme si le disque local avait brûlé : on vide le dossier.
    const dirPerdu = mkdtempSync(path.join(tmpdir(), 'afs-apres-sinistre-'));
    try {
      const telechargement = await downloadBackup(meta.name, dirPerdu);
      expect(telechargement.ok, telechargement.error ?? '').toBe(true);
      expect(telechargement.verification?.ok).toBe(true);
      expect(telechargement.bytes).toBeGreaterThan(0);

      // 3. L'essai de restauration part de la copie externe : base neuve, migrations, restauration,
      //    recomptage indépendant. C'est ce qui autorise à dire « la sauvegarde est utilisable ».
      const essai = await offsiteDrill(meta.name, { dir: dirPerdu });
      expect(essai.ok, JSON.stringify(essai.restore?.incomplets ?? essai.error)).toBe(true);
      expect(essai.source).toBe('hors site');
      expect(essai.sha256).toBe(createHash('sha256').update(s3.objets.get(offsiteKey(meta.name))!.body).digest('hex'));
      const relu = essai.restore!.relu as { restaurants: number; rows: number; tables: Record<string, number> };
      expect(relu.restaurants).toBe(1);
      expect(relu.rows).toBeGreaterThan(10);
      // Les données métier sont bien là, pas seulement un fichier qui se décompresse.
      expect(relu.tables.orders).toBeGreaterThanOrEqual(1);
      expect(relu.tables.order_lines).toBeGreaterThanOrEqual(1);
      expect(relu.tables.suppliers).toBeGreaterThanOrEqual(1);
      expect(essai.restore!.incomplets).toEqual([]);
    } finally { rmSync(dirPerdu, { recursive: true, force: true }); }
  });

  it('une copie distante tronquée est refusée à la vérification (et le dit)', async () => {
    // On dépose une copie tronquée à la place d'une sauvegarde : la vérification doit la refuser.
    const faux = 'afs-dddddddd-20260910T030000-admin.json.gz';
    await putObject(faux, gzipSync(Buffer.from('{"format":"afrisupply.backup","version":1,"tables":{}}')));
    const dir = mkdtempSync(path.join(tmpdir(), 'afs-tronque-'));
    try {
      const telechargement = await downloadBackup(faux, dir);
      expect(telechargement.ok).toBe(false);
      expect(telechargement.error).toMatch(/INCOMPLÈTE|illisible/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('7. L’exploitation voit l’état hors site', () => {
  it('l’API admin expose la configuration, les objets et le dernier envoi (jamais de secret)', async () => {
    const admin = await call('POST', '/api/auth/register', { email: 'admin@afrisupply.fr', password: 'Plantain-Yassa-42', fullName: 'Admin', restaurantName: 'AFRISUPPORT', city: 'Nantes' });
    const tok = (admin.json as { token: string }).token;
    const h = { authorization: `Bearer ${tok}`, 'x-restaurant-id': (admin.json as { restaurant: { id: string } }).restaurant.id };
    const res = await call('GET', '/api/admin/ops', undefined, h);
    expect(res.status).toBe(200);
    const offsite = (res.json as { offsite?: Json }).offsite as Json | undefined;
    expect(offsite).toBeTruthy();
    expect(offsite!.configured).toBe(true);
    expect(Number(offsite!.objects)).toBeGreaterThan(0);
    // Aucune VALEUR secrète ne doit sortir de l'API : ni la clé d'accès, ni la clé secrète, ni un
    // en-tête de signature. (Nommer les variables à renseigner est au contraire utile à l'exploitant.)
    const texte = JSON.stringify(res.json);
    expect(texte).not.toContain('SECRET-DE-TEST');
    expect(texte).not.toContain('CLEF-DE-TEST');
    expect(texte).not.toMatch(/AWS4-HMAC-SHA256|authorization/i);
  });

  it('le job quotidien envoie les sauvegardes hors site et laisse une trace dans job_runs', async () => {
    const { runDailyForAll } = await import('../jobs/daily.js');
    const run = (await runDailyForAll({}));
    const horsSite = (run as unknown as { offsite?: { configured: boolean; uploaded: number; failed: number; objects: number } }).offsite;
    expect(horsSite, JSON.stringify(run).slice(0, 400)).toBeTruthy();
    expect(horsSite!.configured).toBe(true);
    expect(horsSite!.uploaded).toBeGreaterThan(0);
    expect(horsSite!.failed).toBe(0);
    // La trace de supervision existe, et elle dit la vérité sur le hors site.
    const db = await getDb();
    const lignes = await db.select().from(jobRuns).where(eq(jobRuns.job, 'offsite-backup')).orderBy(desc(jobRuns.startedAt)).limit(1);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].status).toBe('ok');
    expect(Number((lignes[0].summary as Json).uploaded)).toBeGreaterThan(0);
  }, 90_000);   // la passe globale traverse tous les restaurants (digests + sauvegardes)

  it('le fichier écrit dans le dossier par défaut est bien un fichier réel (et son nom est exploitable)', async () => {
    mkdirSync(backupDir(), { recursive: true });
    const meta = await sauvegardeLocale(backupDir());
    // Le nom porte le restaurant et l'horodatage : c'est ce qui permet la rétention distante sans
    // dépendre du disque local. Le suffixe `-2`, `-3`… est NORMAL : deux sauvegardes du même
    // restaurant dans la même seconde ne doivent jamais s'écraser (la CI l'a fait remarquer, à
    // raison : le test précédent écrit dans le même dossier par défaut, quelques millisecondes avant).
    expect(meta.name).toMatch(/^afs-[0-9a-f]{8}-\d{8}T\d{6,7}-admin(-\d+)?\.json\.gz$/);
    expect(readFileSync(path.join(backupDir(), meta.name)).length).toBeGreaterThan(0);
    // Et il se relit : une sauvegarde qu'on ne peut pas relire n'en est pas une.
    const { readBackupFile } = await import('../lib/backup.js');
    const relu = await readBackupFile(meta.name);
    expect(relu.totals.rows).toBeGreaterThan(10);
    // Le nom suffixé doit rester reconnu par la rétention distante, sinon la copie ne serait jamais
    // purgée : elle s'accumulerait indéfiniment hors site.
    const { offsiteKey } = await import('../lib/offsite.js');
    expect(offsiteKey(meta.name)).toMatch(/afrisupply\/backups\/afs-[0-9a-f]{8}-\d{8}T\d{6,7}-admin(-\d+)?\.json\.gz$/);
  });
});
