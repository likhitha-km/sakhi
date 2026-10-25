import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { SessionProvider } from './ui/hooks/session.tsx';

export function mountApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </HashRouter>
    </StrictMode>,
  );
}
