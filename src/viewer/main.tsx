import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Viewer } from './Viewer.tsx';

export function mountViewer(fragment: string) {
  createRoot(document.getElementById('root')!).render(<StrictMode><Viewer fragment={fragment} /></StrictMode>);
}
