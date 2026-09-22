// Faux service de stockage S3 pour les tests — sans réseau sortant, sans dépendance.
//
// Il ne se contente pas de dire « oui » : il VÉRIFIE que la requête reçue est bien signée selon la
// méthode AWS V4, et il sait refuser (identifiants faux), altérer une copie, ou tomber en panne.
// C'est ce qui permet d'affirmer que la sauvegarde hors site fonctionne — et qu'on DÉTECTE quand
// elle ne fonctionne pas.
import { createHash, createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ObjetStocke { key: string; body: Buffer; lastModified: Date }

export interface FauxS3 {
  url: string; bucket: string; objets: Map<string, ObjetStocke>;
  requetes: { method: string; key: string; signed: boolean }[];
  /** Refuse tout (simule des identifiants faux ou des droits insuffisants). */
  refuser: boolean;
  /** Rend une copie illisible après l'envoi (simule une altération) : le SHA-256 ne correspondra plus. */
  altererApresEcriture: boolean;
  /** Fait échouer tout appel (simule un service injoignable). */
  injoignable: boolean;
  arreter: () => Promise<void>;
  /** Nombre d'envois de sauvegardes réellement acceptés (hors fiches .meta.json). */
  ecrits: () => number;
}

/**
 * Vérifie une signature AWS V4 sans connaître la clé secrète : on la RECALCULE avec celle du faux
 * service. Une signature refusée par erreur ici ferait échouer les tests : c'est voulu, cela prouve
 * que le client signe vraiment au lieu d'envoyer des requêtes ouvertes.
 */
function signatureValide(method: string, url: URL, entetes: Record<string, string | undefined>, secret: string, region: string, body: Buffer): boolean {
  const auth = entetes.authorization ?? '';
  const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(auth);
  if (!m) return false;
  const [, , dateStamp, regionDemandee, signedHeaders, fournie] = m;
  if (regionDemandee !== region) return false;
  const amzDate = entetes['x-amz-date'] ?? '';
  if (!amzDate.startsWith(dateStamp)) return false;
  const payloadHash = entetes['x-amz-content-sha256'] ?? '';
  // Sur des OCTETS, pas sur une chaîne : décoder du binaire en UTF-8 remplace les séquences
  // invalides, l'empreinte changerait et un envoi correct serait refusé à tort (erreur commise ici).
  if (payloadHash !== createHash('sha256').update(body).digest('hex')) return false;
  const canonQuery = [...url.searchParams.entries()].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&');
  const canonEntetes = signedHeaders.split(';').map((h) => `${h}:${(entetes[h] ?? '').trim()}`).join('\n') + '\n';
  const canonique = [method, url.pathname, canonQuery, canonEntetes, signedHeaders, payloadHash].join('\n');
  const portee = `${dateStamp}/${region}/s3/aws4_request`;
  const aSigner = ['AWS4-HMAC-SHA256', amzDate, portee, createHash('sha256').update(canonique).digest('hex')].join('\n');
  const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
  const cle = hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), 's3'), 'aws4_request');
  return createHmac('sha256', cle).update(aSigner).digest('hex') === fournie;
}

const listerXml = (bucket: string, prefix: string, objets: ObjetStocke[]) => {
  const contenu = objets.filter((o) => o.key.startsWith(prefix)).map((o) =>
    `<Contents><Key>${o.key}</Key><LastModified>${o.lastModified.toISOString()}</LastModified><Size>${o.body.length}</Size></Contents>`).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucket}</Name><Prefix>${prefix}</Prefix><IsTruncated>false</IsTruncated>${contenu}</ListBucketResult>`;
};

export async function demarrerFauxS3(opts: { accessKeyId?: string; secret?: string; bucket?: string; region?: string } = {}): Promise<FauxS3> {
  const secret = opts.secret ?? 'SECRET-DE-TEST';
  const bucket = opts.bucket ?? 'sauvegardes-afrisupply';
  const region = opts.region ?? 'auto';
  const objets = new Map<string, ObjetStocke>();
  const requetes: FauxS3['requetes'] = [];
  const etat = { refuser: false, altererApresEcriture: false, injoignable: false };

  const serveur: Server = createServer((req, res) => {
    const morceaux: Buffer[] = [];
    req.on('data', (c: Buffer) => morceaux.push(c));
    req.on('end', () => {
      const corps = Buffer.concat(morceaux);
      const reponse = (status: number, body?: string | Buffer, type = 'application/xml') => {
        res.writeHead(status, { 'content-type': type });
        res.end(body ?? '');
      };
      if (etat.injoignable) return reponse(503, '<Error><Code>ServiceUnavailable</Code></Error>');
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      // Style « path » : /seau/cle ; style « virtuel » : le seau est dans le nom d'hôte.
      const virtuel = (req.headers.host ?? '').startsWith(`${bucket}.`);
      const chemin = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const cle = virtuel ? chemin : chemin.replace(new RegExp(`^${bucket}/?`), '');
      const entetes = req.headers as Record<string, string | undefined>;
      const porteAuth = Boolean(entetes.authorization);
      const signee = porteAuth && signatureValide(req.method ?? 'GET', url, entetes, secret, region, corps);
      requetes.push({ method: req.method ?? 'GET', key: cle, signed: signee });
      if (porteAuth && !signee) return reponse(403, '<Error><Code>SignatureDoesNotMatch</Code></Error>');
      if (etat.refuser) return reponse(403, '<Error><Code>AccessDenied</Code></Error>');

      if (req.method === 'PUT') {
        objets.set(cle, { key: cle, body: corps, lastModified: new Date() });
        if (etat.altererApresEcriture) {
          const o = objets.get(cle)!;
          o.body = Buffer.concat([o.body, Buffer.from('ALTERE')]);
        }
        res.writeHead(200); return res.end();
      }
      if (req.method === 'GET') {
        if (url.searchParams.has('list-type')) return reponse(200, listerXml(bucket, url.searchParams.get('prefix') ?? '', [...objets.values()]));
        const o = objets.get(cle);
        return o ? reponse(200, o.body, 'application/octet-stream') : reponse(404, '<Error><Code>NoSuchKey</Code></Error>');
      }
      if (req.method === 'HEAD') { res.writeHead(objets.has(cle) ? 200 : 404); return res.end(); }
      if (req.method === 'DELETE') { objets.delete(cle); res.writeHead(204); return res.end(); }
      return reponse(405, '<Error><Code>MethodNotAllowed</Code></Error>');
    });
  });

  await new Promise<void>((resolve) => serveur.listen(0, '127.0.0.1', resolve));
  const port = (serveur.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`, bucket, objets, requetes,
    get refuser() { return etat.refuser; }, set refuser(v: boolean) { etat.refuser = v; },
    get altererApresEcriture() { return etat.altererApresEcriture; }, set altererApresEcriture(v: boolean) { etat.altererApresEcriture = v; },
    get injoignable() { return etat.injoignable; }, set injoignable(v: boolean) { etat.injoignable = v; },
    arreter: () => new Promise<void>((resolve) => serveur.close(() => resolve())),
    ecrits: () => requetes.filter((r) => r.method === 'PUT' && !r.key.endsWith('.meta.json')).length,
  };
}

/** Renseigne l'environnement du hors site sur le faux service, et rend la remise en état. */
export function configurerFauxS3(s3: FauxS3, opts: { prefix?: string; keep?: number; style?: 'path' | 'virtual' } = {}) {
  const avant = { ...process.env };
  process.env.BACKUP_S3_ENDPOINT = s3.url;
  process.env.BACKUP_S3_BUCKET = s3.bucket;
  process.env.BACKUP_S3_ACCESS_KEY_ID = 'CLEF-DE-TEST';
  process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'SECRET-DE-TEST';
  process.env.BACKUP_S3_REGION = 'auto';
  process.env.BACKUP_S3_PREFIX = opts.prefix ?? 'afrisupply/backups';
  process.env.BACKUP_S3_STYLE = opts.style ?? 'path';
  if (opts.keep) process.env.BACKUP_OFFSITE_KEEP = String(opts.keep);
  return () => {
    for (const k of ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY', 'BACKUP_S3_REGION', 'BACKUP_S3_PREFIX', 'BACKUP_S3_STYLE', 'BACKUP_OFFSITE_KEEP']) delete process.env[k];
    for (const [k, v] of Object.entries(avant)) if (v !== undefined) process.env[k] = v;
  };
}

/** Décrit ce qui a été demandé au faux service — utile dans un message d'échec. */
export const journalS3 = (s3: FauxS3) => s3.requetes.map((r) => `${r.method} ${r.key}${r.signed ? '' : ' (NON SIGNÉE)'}`).join(' · ') || '(aucune requête)';
