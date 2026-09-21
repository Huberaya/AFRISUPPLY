import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalHandlers } from './lib/monitoring';
import { FeedbackProvider } from './components/Feedback';
import './index.css';

installGlobalHandlers();
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
// FeedbackProvider : confirmations et notifications intégrées (chantier 11) — monté une seule fois,
// au-dessus de tout : chaque écran peut appeler useConfirm()/useToast().
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><FeedbackProvider><App /></FeedbackProvider></ErrorBoundary></StrictMode>);
