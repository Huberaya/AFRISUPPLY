import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Send, Bot, User } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { PageTitle } from '../components/ui';

interface Answer { answer: string; facts: string[]; actions: { label: string; url: string }[]; intent: string; engine: 'local' | 'llm' }
type Msg = { role: 'user'; text: string } | { role: 'bot'; a: Answer } | { role: 'bot'; error: string };

// **gras** → <strong>
function Rich({ text }: { text: string }) { return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>; }

export default function Assistant() {
  const examples = useApi<{ examples: string[] }>('/assistant/examples');
  const [q, setQ] = useState(''); const [msgs, setMsgs] = useState<Msg[]>([]); const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: question }]); setQ(''); setBusy(true);
    try { const a = await api<Answer>('/assistant/ask', { method: 'POST', json: { question } }); setMsgs((m) => [...m, { role: 'bot', a }]); }
    catch (e) { setMsgs((m) => [...m, { role: 'bot', error: (e as Error).message }]); } finally { setBusy(false); }
  };
  const suggestions = examples.data?.examples ?? [];
  return (
    <div className="animate-fade-up max-w-3xl">
      <PageTitle title="✨ Demander à l’IA" subtitle="Posez vos questions en français : l’assistant interroge vos stocks, prix, recettes et fournisseurs, et répond avec vos chiffres — il n’invente jamais un prix." />
      <div className="card min-h-[50vh] flex flex-col">
        <div className="flex-1 space-y-4">
          {msgs.length === 0 && <div className="text-sm text-stone-500">Exemples : {suggestions.slice(0, 3).map((s) => <span key={s}>« {s} » </span>)}</div>}
          {msgs.map((m, i) => m.role === 'user'
            ? <div key={i} className="flex justify-end gap-2"><div className="rounded-2xl rounded-br-sm bg-brand-700 px-4 py-2 text-sm text-white max-w-[85%]">{m.text}</div><User size={18} className="mt-2 text-stone-400" /></div>
            : <div key={i} className="flex gap-2"><Bot size={18} className="mt-2 text-brand-700 shrink-0" /><div className="rounded-2xl rounded-bl-sm bg-stone-100 px-4 py-3 text-sm max-w-[85%]">
              {'error' in m ? <span className="text-red-700">{m.error}</span> : <>
                <p className="leading-relaxed"><Rich text={m.a.answer} /></p>
                {m.a.facts.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-stone-600">{m.a.facts.map((f, j) => <li key={j}>• <Rich text={f} /></li>)}</ul>}
                {m.a.actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{m.a.actions.map((a) => <Link key={a.url} to={a.url} className="btn-secondary !py-1 !px-2.5 text-xs">{a.label} →</Link>)}</div>}
                <div className="mt-2 text-[10px] uppercase tracking-wide text-stone-400">{m.a.engine === 'llm' ? 'Chiffres locaux · reformulé par LLM' : 'Moteur local · chiffres vérifiables'}</div>
              </>}
            </div></div>)}
          {busy && <div className="flex gap-2 text-sm text-stone-500"><Bot size={18} className="text-brand-700" /> Je regarde vos données…</div>}
          <div ref={endRef} />
        </div>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <input className="input" placeholder="Ex. : Qu’est-ce que je dois commander cette semaine ?" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-primary" disabled={busy || !q.trim()} type="submit"><Send size={16} /></button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{suggestions.map((s) => <button key={s} onClick={() => void ask(s)} className="pill bg-brand-50 text-brand-800 hover:bg-brand-100 !py-1.5 !px-3"><Sparkles size={12} /> {s}</button>)}</div>
      </div>
    </div>
  );
}
