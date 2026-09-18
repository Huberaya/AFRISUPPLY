import { useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { PageTitle } from '../components/ui';

const SUGGESTIONS = ['Qu’est-ce que je dois commander cette semaine ?', 'Pourquoi mes coûts augmentent ?', 'Trouve-moi moins cher pour le riz.', 'Combien me coûte réellement mon mafé ?', 'Quel fournisseur est le plus fiable ?', 'Est-ce que je dois augmenter le prix du poulet braisé ?'];

export default function Assistant() {
  const [q, setQ] = useState('');
  return (
    <div className="animate-fade-up max-w-3xl">
      <PageTitle title="✨ Demander à l’IA" subtitle="Le cerveau de la plateforme (chantier 4). En V1, l’assistant traduit votre question en requêtes sur vos données et répond avec des chiffres — il ne devine jamais un prix." />
      <div className="card">
        <div className="flex gap-2"><input className="input" placeholder="Posez votre question…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn-primary" disabled><Send size={16} /></button></div>
        <p className="mt-2 text-xs text-stone-500">Bientôt disponible — les moteurs (stock, prix, comparateur, recettes) sont déjà en place, il reste à brancher la couche de langage.</p>
        <div className="mt-5 flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} onClick={() => setQ(s)} className="pill bg-brand-50 text-brand-800 hover:bg-brand-100 !py-1.5 !px-3"><Sparkles size={12} /> {s}</button>)}</div>
      </div>
    </div>
  );
}
