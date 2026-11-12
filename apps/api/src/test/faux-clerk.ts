// Faux service Clerk pour les tests (SIMULATION — ne prouve rien sur le vrai service Clerk).
//
// Il fournit exactement ce dont le serveur a besoin pour vérifier une identité :
//   - une paire de clés RSA : la clé publique (PEM) joue le rôle de la « JWT public key » de
//     l'instance Clerk (variable CLERK_JWT_KEY) ; la clé privée signe des jetons de session ;
//   - une API HTTP locale qui répond à GET /v1/users/:id comme l'API Clerk (CLERK_API_URL).
// Le code testé, lui, est le vrai : bibliothèque @clerk/backend, vérification de signature, lecture de fiche.
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT } from 'jose';

export type FauxUtilisateur = {
  id: string; email: string; verified?: boolean; firstName?: string; lastName?: string; phone?: string; banned?: boolean;
};

export type FauxClerk = {
  url: string;
  jwtKey: string;
  /** Ajoute ou remplace une fiche utilisateur. */
  ajouter(u: FauxUtilisateur): void;
  /** Jeton de session signé par l'instance (valide par défaut). */
  jeton(sub: string, opts?: { azp?: string | null; expiresInSec?: number; sts?: string }): Promise<string>;
  /** Jeton signé par UNE AUTRE clé (faux jeton). */
  jetonForge(sub: string): Promise<string>;
  /** Fait répondre l'API en erreur (503) pour simuler Clerk injoignable. */
  panne(active: boolean): void;
  /** Nombre d'appels reçus par l'API. */
  appels(): number;
  fermer(): Promise<void>;
};

const userJson = (u: FauxUtilisateur) => ({
  id: u.id, object: 'user', username: null, first_name: u.firstName ?? null, last_name: u.lastName ?? null,
  image_url: '', has_image: false, primary_email_address_id: `idn_${u.id}`, primary_phone_number_id: u.phone ? `idn_tel_${u.id}` : null,
  primary_web3_wallet_id: null, password_enabled: true, two_factor_enabled: false, totp_enabled: false, backup_code_enabled: false,
  email_addresses: [{ id: `idn_${u.id}`, object: 'email_address', email_address: u.email, reserved: false, linked_to: [],
    verification: u.verified === false ? { status: 'unverified', strategy: 'email_code', attempts: 0, expire_at: null } : { status: 'verified', strategy: 'email_code', attempts: 1, expire_at: null } }],
  phone_numbers: u.phone ? [{ id: `idn_tel_${u.id}`, object: 'phone_number', phone_number: u.phone, reserved_for_second_factor: false, default_second_factor: false, reserved: false, linked_to: [], verification: { status: 'verified', strategy: 'phone_code', attempts: 1, expire_at: null } }] : [],
  web3_wallets: [], passkeys: [], external_accounts: [], saml_accounts: [], enterprise_accounts: [],
  public_metadata: {}, private_metadata: {}, unsafe_metadata: {}, external_id: null,
  last_sign_in_at: Date.now(), banned: !!u.banned, locked: false, lockout_expires_in_seconds: null, verification_attempts_remaining: 100,
  created_at: Date.now(), updated_at: Date.now(), delete_self_enabled: true, create_organization_enabled: true, last_active_at: Date.now(), legal_accepted_at: null,
});

export async function demarrerFauxClerk(): Promise<FauxClerk> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const autre = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const fiches = new Map<string, FauxUtilisateur>();
  let enPanne = false; let n = 0;

  const server = http.createServer((req, res) => {
    n += 1;
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (enPanne) return json(503, { errors: [{ code: 'service_unavailable', message: 'indisponible' }] });
    if (!String(req.headers.authorization ?? '').startsWith('Bearer sk_')) return json(401, { errors: [{ code: 'authorization_invalid', message: 'clé secrète requise' }] });
    const m = /^\/v1\/users\/([^/?]+)/.exec(req.url ?? '');
    if (req.method === 'GET' && m) {
      const u = fiches.get(decodeURIComponent(m[1]));
      return u ? json(200, userJson(u)) : json(404, { errors: [{ code: 'resource_not_found', message: 'not found' }] });
    }
    return json(404, { errors: [{ code: 'resource_not_found', message: 'route inconnue du faux service' }] });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const signer = async (key: KeyObject, sub: string, opts: { azp?: string | null; expiresInSec?: number; sts?: string } = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (opts.expiresInSec ?? 60);
    const claims: Record<string, unknown> = { sid: `sess_${sub}`, iss: 'https://faux-clerk.exemple.test', nbf: Math.min(now, exp) - 10, iat: Math.min(now, exp) - 10, exp };
    if (opts.azp !== null) claims.azp = opts.azp ?? 'http://localhost:3000';
    if (opts.sts) claims.sts = opts.sts;
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'ins_faux' }).setSubject(sub).sign(key);
  };

  return {
    url,
    jwtKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    ajouter: (u) => { fiches.set(u.id, u); },
    jeton: (sub, opts) => signer(privateKey, sub, opts),
    jetonForge: (sub) => signer(autre.privateKey, sub),
    panne: (active) => { enPanne = active; },
    appels: () => n,
    fermer: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
