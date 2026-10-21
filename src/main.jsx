import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { TooltipProvider } from './components/ui/tooltip';
import './style.css';

const App = lazy(() => import('./tldraw/TldrawApp'));

createRoot(document.getElementById('root')).render(
  <TooltipProvider delayDuration={400}><Suspense fallback={null}><App/></Suspense></TooltipProvider>
);
