// Chantier 13 (audit n°3) — SAUVEGARDE HORS SITE.
//
// Le défaut mesuré : les sauvegardes s'écrivaient uniquement sur le disque de la machine qui les
// produisait. En serverless, ce disque est **éphémère** : la sauvegarde disparaît avec l'instance.
// Une sauvegarde qui vit à côté de la base qu'elle protège ne protège de rien (panne, suppression,
// rançon, erreur humaine).
//
// Ce module envoie donc chaque sauvegarde vers un espace de stockage externe compatible S3
// (AWS S3, Cloudflare R2, Backblaze B2, Scaleway, MinIO…), en respectant trois règles :
//
//   1. **Zéro dépendance** : la signature AWS V4 est implémentée ici (node:crypto). Rien de plus à
//      installer, rien à mettre à jour, aucun paquet à auditer.
//   2. **Une copie n'est « réussie » que si elle est RELUE** : après l'envoi, on re-télécharge
//      l'objet et on compare les empreintes SHA-256. Une copie illisible ou altérée est signalée
//      comme un échec — et supprimée pour ne pas laisser croire qu'elle existe.
//   3. **L'honnêteté d'abord** : sans configuration, chaque fonction répond « non configuré » en
//      nommant les variables manquantes. Aucun succès n'est jamais simulé.
import { createHash, createHmac } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { alertAdmin } from './ops.js';
import { backupDir, listBackups, readBackupFile, restoreDrill, verifyBackup, type BackupFile } from './backup.js';

// ---------------------------------------------------------------- configuration

export interface OffsiteConfig {
  configured: boolean;
  endpoint: string; bucket: string; region: string; prefix: string; style: 'path' | 'virtual'; keep: number;
  /** Variables d'environnement manquantes, nommées — pour dire exactement quoi renseigner. */
  missing: string[];
  /** Phrase prête à afficher dans l'exploitation. */
  why: string;
}

const trim = (v: string | undefined) => (v ?? '').trim();
const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * Configuration lue à chaque appel (jamais figée au chargement) : un environnement corrigé doit
 * prendre effet sans redéployer une image.
 */
export function offsiteConfig(): OffsiteConfig {
  const endpoint = trim(process.env.BACKUP_S3_ENDPOINT).replace(/\/+$/, '');
  const bucket = trim(process.env.BACKUP_S3_BUCKET);
  const keyId = trim(process.env.BACKUP_S3_ACCESS_KEY_ID);
  const secret = trim(process.env.BACKUP_S3_SECRET_ACCESS_KEY);
  const missing: string[] = [];
  if (!endpoint) missing.push('BACKUP_S3_ENDPOINT');
  if (!bucket) missing.push('BACKUP_S3_BUCKET');
  if (!keyId) missing.push('BACKUP_S3_ACCESS_KEY_ID');
  if (!secret) missing.push('BACKUP_S3_SECRET_ACCESS_KEY');
  const style = trim(process.env.BACKUP_S3_STYLE).toLowerCase() === 'virtual' ? 'virtual' as const : 'path' as const;
  const configured = missing.length === 0;
  return {
    configured,
    endpoint: configured ? withScheme(endpoint) : '',
    bucket, region: trim(process.env.BACKUP_S3_REGION) || 'auto', prefix: trim(process.env.BACKUP_S3_PREFIX).replace(/^\/+|\/+$/g, '') || 'afrisupply/backups',
    style, keep: Math.max(1, Number(process.env.BACKUP_OFFSITE_KEEP ?? process.env.BACKUP_KEEP ?? 14)),
    missing,
    why: configured
      ? 'Sauvegarde hors site configurée.'
      : `Sauvegarde hors site NON configurée : renseignez ${missing.join(', ')} (voir docs/SAUVEGARDE_HORS_SITE.md).`,
  };
}

export const offsiteConfigured = () => offsiteConfig().configured;

/** Clé distante d'un fichier de sauvegarde (préfixe + nom). */
export const offsiteKey = (name: string, cfg = offsiteConfig()) => [cfg.prefix, name].filter(Boolean).join('/');

// ---------------------------------------------------------------- signature AWS V4

const sha256Hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
/** Empreinte d'un corps vide : exposée pour être vérifiable de l'extérieur (et dans les tests). */
export const EMPTY_SHA256 = sha256Hex('');

/** Encode un chemin S3 comme l'exige la signature : « / » conservés, le reste encodé. */
const encodePath = (p: string) => p.split('/').map((s) => encodeURIComponent(s)).join('/');
/** Encode une valeur de requête (espace en %20, comme AWS). */
const encodeQuery = (v: string) => encodeURIComponent(v).replace(/%7E/g, '~');

interface Cible { url: string; host: string; canonicalUri: string }

/** URL et chemin canonique d'un objet ou du seau (selon le style de chemin demandé par le service). */
function cible(cfg: OffsiteConfig, key: string, query: [string, string][] = []): Cible {
  const url = new URL(cfg.endpoint);
  const pathStyle = cfg.style === 'path';
  const host = pathStyle ? url.host : `${cfg.bucket}.${url.host}`;
  const canonicalUri = pathStyle ? `/${encodePath(`${cfg.bucket}/${key}`.replace(/\/$/, ''))}`.replace(/\/{2,}/g, '/') : `/${encodePath(key)}`;
  const q = [...query].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${encodeQuery(k)}=${encodeQuery(v)}`).join('&');
  return { url: `${url.protocol}//${host}${canonicalUri}${q ? `?${q}` : ''}`, host, canonicalUri };
}

/** Requête signée AWS V4 (en-têtes signés : host, x-amz-content-sha256, x-amz-date). */
function signer(cfg: OffsiteConfig, method: string, target: Cible, body: Buffer, query: [string, string][]) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalQuery = query.map(([k, v]) => `${encodeQuery(k)}=${encodeQuery(v)}`).sort().join('&');
  const canonicalHeaders = `host:${target.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, target.canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${trim(process.env.BACKUP_S3_SECRET_ACCESS_KEY)}`, dateStamp), cfg.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex');
  return {
    headers: {
      host: target.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${trim(process.env.BACKUP_S3_ACCESS_KEY_ID)}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** Traduction lisible d'un refus du service : un code nu ne dit pas quoi corriger. */
function expliquer(status: number, corps: string, cfg: OffsiteConfig): string {
  const code = /<Code>([^<]+)<\/Code>/.exec(corps)?.[1] ?? '';
  const fin = code ? ` (${code})` : '';
  if (status === 401 || status === 403) return `le service a refusé les identifiants${fin} : vérifiez BACKUP_S3_ACCESS_KEY_ID / BACKUP_S3_SECRET_ACCESS_KEY et les droits d'écriture sur « ${cfg.bucket} »`;
  if (status === 404) return `seau ou objet introuvable${fin} : vérifiez BACKUP_S3_BUCKET (« ${cfg.bucket} ») et BACKUP_S3_ENDPOINT`;
  if (status === 301 || status === 307 || status === 400) return `le service a refusé la requête${fin} : BACKUP_S3_REGION (« ${cfg.region} ») ou BACKUP_S3_STYLE (« ${cfg.style} ») ne correspond peut-être pas à ce service`;
  if (status === 429) return `le service limite le débit${fin} : réessayez plus tard`;
  if (status >= 500) return `le service distant est en incident (HTTP ${status})${fin}`;
  return `le service a répondu HTTP ${status}${fin} : ${corps.slice(0, 180)}`;
}

interface Reponse { ok: boolean; status: number; body: Buffer; error?: string }

/**
 * Appel signé avec délai maximum et 2 reprises sur incident passager (réseau, 5xx, 429).
 * Les refus définitifs (403, 404…) ne sont pas réessayés : réessayer ne les corrige pas.
 */
async function appel(cfg: OffsiteConfig, method: string, key: string, opts: { body?: Buffer; query?: [string, string][]; timeoutMs?: number } = {}): Promise<Reponse> {
  const body = opts.body ?? Buffer.alloc(0);
  const query = opts.query ?? [];
  const target = cible(cfg, key, query);
  const { headers } = signer(cfg, method, target, body, query);
  let dernier = 'aucune réponse';
  for (let tentative = 1; tentative <= 3; tentative++) {
    try {
      const res = await fetch(target.url, {
        method, headers: { ...headers, ...(body.length ? { 'content-type': 'application/octet-stream' } : {}) },
        body: body.length ? new Uint8Array(body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.ok) return { ok: true, status: res.status, body: buf };
      const passager = res.status >= 500 || res.status === 429;
      dernier = expliquer(res.status, buf.toString('utf8'), cfg);
      if (!passager || tentative === 3) return { ok: false, status: res.status, body: buf, error: dernier };
    } catch (e) {
      dernier = `le service hors site est injoignable (${(e as Error).name === 'TimeoutError' ? 'délai dépassé' : (e as Error).message}) : vérifiez BACKUP_S3_ENDPOINT (« ${cfg.endpoint} »)`;
    }
    await new Promise((r) => setTimeout(r, 300 * tentative * tentative));
  }
  return { ok: false, status: 0, body: Buffer.alloc(0), error: dernier };
}

/** Refus uniforme : jamais un succès, toujours la raison exacte et ce qui manque. */
const refus = (cfg: OffsiteConfig) => ({ ok: false as const, configured: cfg.configured, key: undefined as string | undefined, error: cfg.why });

// ---------------------------------------------------------------- opérations de base

/** Dépose un objet. La taille et l'empreinte sont renvoyées pour être vérifiables ensuite. */
export async function putObject(name: string, body: Buffer, cfg = offsiteConfig()) {
  if (!cfg.configured) return refus(cfg);
  const key = offsiteKey(name, cfg);
  const res = await appel(cfg, 'PUT', key, { body });
  if (!res.ok) return { ok: false as const, configured: true, key, error: res.error };
  return { ok: true as const, configured: true, key, bytes: body.length, sha256: sha256Hex(body) };
}

/** Relit un objet hors site (preuve que la copie est réellement récupérable). */
export async function getObject(name: string, cfg = offsiteConfig()) {
  if (!cfg.configured) return refus(cfg);
  const key = offsiteKey(name, cfg);
  const res = await appel(cfg, 'GET', key);
  if (!res.ok) return { ok: false as const, configured: true, key, error: res.error };
  return { ok: true as const, configured: true, key, bytes: res.body.length, sha256: sha256Hex(res.body), body: res.body };
}

export async function headObject(name: string, cfg = offsiteConfig()) {
  if (!cfg.configured) return refus(cfg);
  const key = offsiteKey(name, cfg);
  const res = await appel(cfg, 'HEAD', key, { timeoutMs: 20_000 });
  if (!res.ok) return { ok: false as const, configured: true, key, error: res.error };
  return { ok: true as const, configured: true, key };
}

export async function deleteObject(name: string, cfg = offsiteConfig()) {
  if (!cfg.configured) return refus(cfg);
  const key = offsiteKey(name, cfg);
  const res = await appel(cfg, 'DELETE', key, { timeoutMs: 20_000 });
  if (!res.ok) return { ok: false as const, configured: true, key, error: res.error };
  return { ok: true as const, configured: true, key };
}

export interface ObjetDistant { key: string; name: string; bytes: number; lastModified: string | null }

/** Liste les objets de notre préfixe (pagination réelle : un seau peut en contenir plus de 1000). */
export async function listObjects(cfg = offsiteConfig(), maxPages = 10): Promise<{ ok: boolean; configured: boolean; objects: ObjetDistant[]; truncated: boolean; error?: string }> {
  if (!cfg.configured) return { ...refus(cfg), objects: [], truncated: false };
  const objects: ObjetDistant[] = [];
  let token: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const query: [string, string][] = [['list-type', '2'], ['prefix', `${cfg.prefix}/`], ['max-keys', '1000']];
    if (token) query.push(['continuation-token', token]);
    const res = await appel(cfg, 'GET', '', { query, timeoutMs: 30_000 });
    if (!res.ok) return { ok: false, configured: true, objects, truncated: false, error: res.error };
    const xml = res.body.toString('utf8');
    for (const bloc of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []) {
      const key = decodeXml(/<Key>([\s\S]*?)<\/Key>/.exec(bloc)?.[1] ?? '');
      const taille = Number(/<Size>(\d+)<\/Size>/.exec(bloc)?.[1] ?? 0);
      const quand = decodeXml(/<LastModified>([\s\S]*?)<\/LastModified>/.exec(bloc)?.[1] ?? '') || null;
      if (key) objects.push({ key, name: key.slice(cfg.prefix.length + 1), bytes: taille, lastModified: quand });
    }
    const tronque = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    token = decodeXml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '') || null;
    if (!tronque || !token) return { ok: true, configured: true, objects, truncated: false };
  }
  return { ok: true, configured: true, objects, truncated: true };
}

const decodeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// ---------------------------------------------------------------- envoi vérifié d'un fichier

export interface EnvoiResultat {
  ok: boolean; configured: boolean; name: string; key?: string; bytes?: number; sha256?: string;
  verified: boolean; supprimeCarAltere?: boolean; tookMs: number; error?: string;
}

/**
 * Envoie un fichier local puis RELIT la copie distante pour comparer les empreintes.
 * Si la copie relue ne correspond pas, elle est supprimée : mieux vaut pas de copie qu'une copie
 * qui donne l'illusion d'exister.
 */
export async function uploadFile(fileName: string, dir = backupDir(), cfg = offsiteConfig()): Promise<EnvoiResultat> {
  const debut = Date.now();
  const vide = (error: string): EnvoiResultat => ({ ok: false, configured: cfg.configured, name: fileName, verified: false, tookMs: Date.now() - debut, error });
  if (!cfg.configured) return vide(cfg.why);
  let body: Buffer;
  try { body = await fs.readFile(path.join(dir, fileName)); } catch (e) { return vide(`fichier local illisible « ${fileName} » : ${(e as Error).message}`); }
  const envoi = await putObject(fileName, body, cfg);
  if (!envoi.ok) return vide(envoi.error ?? 'envoi refusé');
  const relecture = await getObject(fileName, cfg);
  if (!relecture.ok) return vide(`copie déposée mais NON relue (${relecture.error ?? 'lecture impossible'}) : elle ne compte pas comme sauvegarde`);
  if (relecture.sha256 !== envoi.sha256 || relecture.bytes !== body.length) {
    const efface = await deleteObject(fileName, cfg);
    return { ok: false, configured: true, name: fileName, key: envoi.key, bytes: body.length, sha256: envoi.sha256, verified: false, supprimeCarAltere: efface.ok, tookMs: Date.now() - debut, error: `la copie relue ne correspond pas au fichier local (${relecture.bytes} octets contre ${body.length}) : copie supprimée` };
  }
  return { ok: true, configured: true, name: fileName, key: envoi.key, bytes: body.length, sha256: envoi.sha256, verified: true, tookMs: Date.now() - debut };
}

// ---------------------------------------------------------------- commande complète

export interface SweepResultat {
  configured: boolean; ok: boolean; endpoint: string | null; bucket: string | null; prefix: string;
  uploaded: EnvoiResultat[]; failed: { name: string; error: string }[]; removed: string[]; kept: number;
  /** Noms demandés mais absents du disque : un opérateur doit le savoir, jamais le deviner. */
  introuvables: string[];
  objects: number; bytes: number; tookMs: number; error?: string;
}

const HORS_SITE = /^afs-([0-9a-f]{8})-(\d{8}T\d{6,7})-(admin|owner)(-\d+)?\.json\.gz(\.meta\.json)?$/i;

/** Groupe (restaurant) d'un nom de sauvegarde — sert à la rétention distante, sans dépendre du disque local. */
const groupeDe = (name: string) => HORS_SITE.exec(name)?.[1] ?? null;

/**
 * Rétention DISTANTE : on ne supprime un objet que si l'on est certain qu'une copie plus récente du
 * même restaurant existe hors site. Le disque local n'est jamais consulté pour décider d'une
 * suppression : une instance neuve (disque vide) ne doit pas pouvoir effacer l'archive.
 */
export async function pruneOffsite(keep = offsiteConfig().keep, cfg = offsiteConfig()) {
  if (!cfg.configured) return { ...refus(cfg), removed: [] as string[], kept: 0 };
  const liste = await listObjects(cfg);
  if (!liste.ok) return { ok: false as const, configured: true, removed: [] as string[], kept: 0, error: liste.error };
  const parGroupe = new Map<string, ObjetDistant[]>();
  for (const o of liste.objects) {
    const g = groupeDe(o.name);
    if (!g) continue;   // objet étranger au format : on n'y touche jamais
    parGroupe.set(g, [...(parGroupe.get(g) ?? []), o]);
  }
  const removed: string[] = [];
  for (const [, objets] of parGroupe) {
    // Tri par horodatage présent dans le nom (lisible et stable), puis par clé.
    const tries = [...objets].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    const parSauvegarde = new Map<string, ObjetDistant[]>();
    for (const o of tries) {
      const base = o.name.replace(/\.meta\.json$/, '');
      parSauvegarde.set(base, [...(parSauvegarde.get(base) ?? []), o]);
    }
    const sauvegardes = [...parSauvegarde.keys()].sort().reverse();
    for (const base of sauvegardes.slice(keep)) {
      for (const o of parSauvegarde.get(base) ?? []) {
        const efface = await deleteObject(o.name, cfg);
        if (efface.ok) removed.push(o.name);
      }
    }
  }
  return { ok: true as const, configured: true, removed, kept: keep };
}

/**
 * Envoie hors site les sauvegardes locales (fichier + fiche lisible), vérifie chaque copie, applique
 * la rétention distante et laisse une trace dans job_runs. Utilisé par le job quotidien, le bouton
 * d'administration et la supervision.
 */
export async function offsiteSweep(opts: { names?: string[]; dir?: string; keep?: number; prune?: boolean } = {}): Promise<SweepResultat> {
  const debut = Date.now();
  const cfg = offsiteConfig();
  const dir = opts.dir ?? backupDir();
  const base: SweepResultat = {
    configured: cfg.configured, ok: false, endpoint: cfg.configured ? new URL(cfg.endpoint).host : null, bucket: cfg.configured ? cfg.bucket : null,
    prefix: cfg.prefix, uploaded: [], failed: [], removed: [], kept: 0, introuvables: [], objects: 0, bytes: 0, tookMs: 0,
  };
  if (!cfg.configured) return { ...base, tookMs: Date.now() - debut, error: cfg.why };
  const noms = opts.names?.length ? opts.names : (await listBackups(dir)).map((b) => b.name);
  if (!noms.length) return { ...base, tookMs: Date.now() - debut, error: 'aucune sauvegarde locale à envoyer — lancez d’abord une sauvegarde' };

  const uploaded: EnvoiResultat[] = []; const failed: { name: string; error: string }[] = []; const introuvables: string[] = [];
  for (const name of noms) {
    let trouve = false;
    for (const fichier of [`${name}`, `${name}.meta.json`]) {
      try { await fs.access(path.join(dir, fichier)); } catch { continue; }   // la fiche est facultative
      trouve = true;
      const res = await uploadFile(fichier, dir, cfg);
      if (res.ok) uploaded.push(res); else failed.push({ name: fichier, error: res.error ?? 'échec inconnu' });
    }
    // Un nom demandé mais absent du disque doit être DIT : sinon un opérateur croirait que tout est
    // parti alors que rien n'a été envoyé.
    if (!trouve) introuvables.push(name);
  }
  const pruned = opts.prune === false ? { removed: [], kept: 0 } : await pruneOffsite(opts.keep ?? cfg.keep, cfg);
  const liste = await listObjects(cfg);
  const bytes = liste.objects.reduce((a, o) => a + o.bytes, 0);
  const resultat: SweepResultat = {
    ...base, ok: failed.length === 0 && uploaded.length > 0 && introuvables.length === 0, uploaded, failed, introuvables,
    removed: pruned.removed, kept: pruned.kept, objects: liste.objects.length, bytes, tookMs: Date.now() - debut,
    error: failed.length ? `${failed.length} envoi(s) en échec`
      : introuvables.length ? `aucun fichier local pour : ${introuvables.join(', ')} (dossier « ${dir} »)`
      : uploaded.length === 0 ? 'rien à envoyer' : undefined,
  };
  // Un échec d'envoi hors site ne doit jamais faire échouer la sauvegarde locale (déjà écrite), mais
  // il ne doit jamais passer inaperçu non plus : trace de job + alerte.
  if (failed.length) {
    const message = `[sauvegarde hors site] ${failed.length} envoi(s) en échec vers ${resultat.endpoint ?? 'le stockage distant'} — les sauvegardes locales existent, la copie externe est incomplète.`;
    void alertAdmin({ key: 'offsite_backup_failed', message, detail: { endpoint: resultat.endpoint, bucket: resultat.bucket, failed: failed.slice(0, 10) } });
  }
  return resultat;
}

// ---------------------------------------------------------------- relecture et essai depuis l'extérieur

export interface TelechargementResultat {
  ok: boolean; configured: boolean; name: string; key?: string; path?: string; bytes?: number; sha256?: string;
  verification?: { ok: boolean; problems: string[] }; lastModified?: string | null; tookMs: number; error?: string;
}

/**
 * Récupère une copie DEPUIS le stockage externe vers un fichier local, puis la vérifie (format,
 * version, empreinte du contenu). C'est la seule façon honnête de dire « la copie hors site est
 * utilisable » : la relire, pas croire qu'elle est là.
 */
export async function downloadBackup(name: string, dir = backupDir(), cfg = offsiteConfig()): Promise<TelechargementResultat> {
  const debut = Date.now();
  if (!cfg.configured) return { ok: false, configured: false, name, tookMs: 0, error: cfg.why };
  if (!HORS_SITE.test(name)) return { ok: false, configured: true, name, tookMs: 0, error: `nom de sauvegarde inattendu « ${name} »` };
  const distant = await getObject(name, cfg);
  if (!distant.ok) return { ok: false, configured: true, name, key: distant.key, tookMs: Date.now() - debut, error: distant.error };
  const liste = await listObjects(cfg);
  const meta = liste.objects.find((o) => o.name === name);
  await fs.mkdir(dir, { recursive: true });
  const chemin = path.join(dir, name);
  await fs.writeFile(chemin, distant.body);
  let backup: BackupFile;
  try {
    const { gunzipSync } = await import('node:zlib');
    backup = JSON.parse(gunzipSync(distant.body).toString('utf8')) as BackupFile;
  } catch (e) {
    return { ok: false, configured: true, name, key: distant.key, bytes: distant.bytes, sha256: distant.sha256, tookMs: Date.now() - debut, error: `copie téléchargée mais illisible (${(e as Error).message}) : elle n'est pas exploitable` };
  }
  const verification = verifyBackup(backup);
  return {
    ok: verification.ok, configured: true, name, key: distant.key, path: chemin, bytes: distant.bytes, sha256: distant.sha256,
    verification: { ok: verification.ok, problems: verification.problems }, lastModified: meta?.lastModified ?? null,
    tookMs: Date.now() - debut,
    error: verification.ok ? undefined : `copie téléchargée mais INCOMPLÈTE : ${verification.problems.join(' | ')}`,
  };
}

export interface DrillResultat {
  ok: boolean; configured: boolean; source: 'hors site'; name: string; key?: string; bytes?: number; sha256?: string;
  downloadMs: number; restore?: Awaited<ReturnType<typeof restoreDrill>>; error?: string;
}

/**
 * ESSAI DE RESTAURATION DEPUIS LA COPIE EXTERNE — la preuve que l'audit réclame.
 * Télécharger la copie hors site, la vérifier, la recharger dans une base neuve et jetable, compter
 * les lignes. Si ce chemin échoue, il n'y a pas de sauvegarde récupérable, quel que soit le nombre
 * de fichiers présents.
 */
export async function offsiteDrill(name: string, opts: { dir?: string } = {}): Promise<DrillResultat> {
  const debut = Date.now();
  const cfg = offsiteConfig();
  if (!cfg.configured) return { ok: false, configured: false, source: 'hors site', name, downloadMs: 0, error: cfg.why };
  const dossier = opts.dir ?? (await fs.mkdtemp(path.join(tmpdir(), 'afs-hors-site-')));
  const copie = await downloadBackup(name, dossier, cfg);
  const downloadMs = Date.now() - debut;
  if (!copie.ok) return { ok: false, configured: true, source: 'hors site', name, key: copie.key, bytes: copie.bytes, sha256: copie.sha256, downloadMs, error: copie.error };
  const backup = await readBackupFile(name, dossier);
  const rapport = await restoreDrill(backup);
  return { ok: rapport.ok, configured: true, source: 'hors site', name, key: copie.key, bytes: copie.bytes, sha256: copie.sha256, downloadMs, restore: rapport };
}

// ---------------------------------------------------------------- état lisible

export interface OffsiteStats {
  configured: boolean; missing: string[]; pourquoi: string;
  endpoint: string | null; bucket: string | null; prefix: string; region: string; style: string; keep: number;
  objects: number; bytes: number; lastUploadAt: string | null; lastBackupName: string | null; oldestUploadAt: string | null;
  error?: string;
}

/** État du hors site, tel qu'un exploitant peut le lire — jamais de secret, jamais de chiffre inventé. */
export async function offsiteStats(cfg = offsiteConfig()): Promise<OffsiteStats> {
  const base: OffsiteStats = {
    configured: cfg.configured, missing: cfg.missing, pourquoi: cfg.why,
    endpoint: cfg.configured ? new URL(cfg.endpoint).host : null, bucket: cfg.configured ? cfg.bucket : null,
    prefix: cfg.prefix, region: cfg.region, style: cfg.style, keep: cfg.keep,
    objects: 0, bytes: 0, lastUploadAt: null, lastBackupName: null, oldestUploadAt: null,
  };
  if (!cfg.configured) return base;
  const liste = await listObjects(cfg);
  if (!liste.ok) return { ...base, error: liste.error };
  const sauvegardes = liste.objects.filter((o) => !o.name.endsWith('.meta.json'));
  const dates = liste.objects.map((o) => o.lastModified).filter((d): d is string => Boolean(d)).sort();
  const derniere = [...sauvegardes].sort((a, b) => (a.name < b.name ? 1 : -1))[0] ?? null;
  return {
    ...base, objects: liste.objects.length, bytes: liste.objects.reduce((a, o) => a + o.bytes, 0),
    lastUploadAt: dates.length ? dates[dates.length - 1] : null, lastBackupName: derniere?.name ?? null,
    oldestUploadAt: dates.length ? dates[0] : null,
  };
}
