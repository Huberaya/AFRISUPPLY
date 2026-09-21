// Chantier 12 (audit) — « Mes données » : le restaurant voit (et peut récupérer) tout ce que la
// plateforme sait de lui, et sait qu'une sauvegarde existe vraiment, avec une date.
//
// Constat de l'audit : la page Mentions légales promettait un « export complet JSON » qui n'existait
// nulle part dans l'interface, et personne ne pouvait dire si les sauvegardes existaient.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, HardDrive, Mail, ShieldCheck, Clock, LifeBuoy, KeyRound, Trash2 } from 'lucide-react';
import { downloadFile } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle, Loader, ErrorBox, Stat } from '../components/ui';
import { useToast } from '../components/Feedback';
import { SUPPORT_EMAIL, SUPPORT_HOURS, SUPPORT_RESPONSE, mailtoSupport } from '../lib/support';

type BackupStatus = {
  lastBackupAt: string | null; lastBackupAgeHours: number | null; copies: number;
  retentionDays: number; sizeBytes: number | null; exportUrl: string; note: string;
};

const ago = (hours: number | null) => {
  if (hours === null) return 'jamais';
  if (hours < 1) return 'il y a moins d’une heure';
  if (hours < 24) return `il y a ${Math.round(hours)} h`;
  return `il y a ${Math.round(hours / 24)} jour(s)`;
};
const taille = (b: number | null) => (b === null ? '—' : b < 1024 ? `${b} o` : b < 1_048_576 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1_048_576).toFixed(1)} Mo`);

export default function MesDonnees() {
  const { data, error, loading, reload } = useApi<BackupStatus>('/backup/status');
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const exporter = async () => {
    setBusy(true);
    try {
      await downloadFile('/backup/export', `afrisupply-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('Fichier téléchargé', 'Il contient vos produits, fournisseurs, commandes, stock, ventes et alertes.');
    } catch (e) {
      toast.error('Téléchargement impossible', (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <PageTitle
        title="🔐 Mes données"
        subtitle="Vos données vous appartiennent : récupérez-les en un clic, et vérifiez que vos sauvegardes existent vraiment."
        action={<button className="btn-primary" disabled={busy} onClick={() => void exporter()}><Download size={16} /> {busy ? 'Préparation…' : 'Télécharger mes données'}</button>}
      />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {!data && loading && <Loader label="Lecture de l’état des sauvegardes…" />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Sauvegardes de mon restaurant" value={data.copies} hint={data.copies ? 'fichiers conservés' : 'aucune pour l’instant'} tone={data.copies ? 'good' : 'warn'} />
            <Stat label="Dernière sauvegarde" value={ago(data.lastBackupAgeHours)} hint={data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString('fr-FR') : 'en attente de la prochaine passe'} tone={data.lastBackupAt && (data.lastBackupAgeHours ?? 99) <= 36 ? 'good' : 'warn'} />
            <Stat label="Conservation" value={`${data.retentionDays} jours`} hint="puis rotation automatique" />
            <Stat label="Taille du dernier fichier" value={taille(data.sizeBytes)} hint="compressé (lisible en JSON)" />
          </div>

          <div className="card space-y-3">
            <h2 className="flex items-center gap-2 font-bold"><HardDrive size={18} /> Ce qui se passe chaque nuit</h2>
            <p className="text-sm text-stone-700">
              Chaque nuit, la plateforme écrit un fichier de sauvegarde de <b>votre</b> restaurant : produits, fournisseurs,
              offres et prix pratiqués, stock et mouvements, commandes, réceptions, écarts, recettes, ventes, alertes,
              listes de courses, litiges. Le fichier porte une empreinte SHA-256 : si une seule ligne change, la
              vérification le voit.
            </p>
            <ul className="space-y-1 text-sm text-stone-600">
              <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" /> Il ne contient <b>jamais</b> les données d’un autre restaurant.</li>
              <li className="flex gap-2"><KeyRound size={16} className="mt-0.5 shrink-0 text-emerald-600" /> Il ne contient <b>pas</b> les mots de passe : un fichier qu’on vous remet ne doit pas donner accès à vos comptes.</li>
              <li className="flex gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-emerald-600" /> Les {data.retentionDays} dernières sauvegardes sont conservées (rotation automatique).</li>
            </ul>
            <p className="text-xs text-stone-500">{data.note}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card space-y-2">
              <h2 className="font-bold">Vos droits, en clair</h2>
              <p className="text-sm text-stone-700">Accès : le bouton « Télécharger mes données » (portabilité, format JSON lisible). Rectification : <Link className="underline" to="/app/parametres">Paramètres</Link>. Effacement : <Link className="underline" to="/app/parametres">Paramètres → Zone dangereuse</Link>.</p>
              <p className="flex items-start gap-2 text-sm text-stone-600"><Trash2 size={16} className="mt-0.5 shrink-0" /> La suppression est immédiate et définitive après confirmation écrite ; nous vous remettons d’abord votre export.</p>
            </div>
            <div className="card space-y-2">
              <h2 className="flex items-center gap-2 font-bold"><LifeBuoy size={18} /> Besoin de nous ?</h2>
              <p className="text-sm text-stone-700">Écrivez à <a className="font-semibold underline" href={mailtoSupport('AFRISUPPLY — demande d’assistance')}>{SUPPORT_EMAIL}</a>. {SUPPORT_HOURS}.</p>
              <p className="text-sm text-stone-600">{SUPPORT_RESPONSE}</p>
              <p className="text-xs text-stone-500">Un incident bloquant ? Dites-le en objet du message (« bloquant ») : il passe en tête.</p>
            </div>
          </div>

          <p className="text-xs text-stone-500">
            Astuce : le fichier exporté peut être rechargé par l’équipe AFRISUPPLY dans une base neuve — c’est notre
            procédure de reprise après sinistre, et elle est testée à chaque sauvegarde.
          </p>
        </>
      )}
      <div className="card flex flex-wrap items-center gap-2 text-sm text-stone-600">
        <Mail size={16} /> Chaque téléchargement et chaque restauration est inscrit dans le journal d’audit de la plateforme (qui, quand, quoi) — consultable par l’équipe AFRISUPPLY, jamais modifiable.
      </div>
    </div>
  );
}
