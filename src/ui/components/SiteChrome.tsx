import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { CloseButton, jumpTo, Logo, Overlay } from './common.tsx';

export const SITE_SECTIONS = [
  { id: 'how', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'faq', label: 'Questions' },
];

/** Goes to a section of the homepage, from any page. */
export function useSectionLink() {
  const nav = useNavigate();
  const loc = useLocation();
  return (id: string) => {
    if (loc.pathname === '/') jumpTo(id);
    else nav('/', { state: { section: id } });
  };
}

export function PrimaryCta({ className = 'btn btn-primary' }: { className?: string }) {
  return <Link to="/signup" className={className}>Create my journal</Link>;
}

export function SiteHeader() {
  const go = useSectionLink();
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" aria-label="Sakhi, homepage"><Logo /></Link>
        <nav aria-label="Website" className="site-nav">
          {SITE_SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} onClick={e => { e.preventDefault(); go(s.id); }}>{s.label}</a>
          ))}
          <Link to="/help" className="urgent-link">Urgent help</Link>
        </nav>
        <div className="row site-actions">
          <Link to="/signin" className="btn btn-quiet site-signin">Sign in</Link>
          <PrimaryCta className="btn btn-primary site-cta" />
          <button type="button" className="icon-btn site-menu-btn" aria-label="Menu" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <Overlay open={open} onClose={() => setOpen(false)} label="Menu" variant="bottom">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Menu</h2>
          <CloseButton onClick={() => setOpen(false)} />
        </div>
        <nav aria-label="Website menu" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SITE_SECTIONS.map(s => (
            <a key={s.id} className="nav-link" href={`#${s.id}`} onClick={e => { e.preventDefault(); setOpen(false); setTimeout(() => go(s.id), 50); }}>{s.label}</a>
          ))}
          <Link className="nav-link urgent-link" to="/help" onClick={() => setOpen(false)}>Urgent help</Link>
          <Link className="nav-link" to="/now" onClick={() => setOpen(false)}>Something urgent?</Link>
          <div className="stack" style={{ marginTop: 12 }}>
            <PrimaryCta className="btn btn-primary btn-block" />
            <Link to="/signin" className="btn btn-secondary btn-block" onClick={() => setOpen(false)}>Sign in</Link>
          </div>
        </nav>
      </Overlay>
    </header>
  );
}

export function SiteFooter() {
  const go = useSectionLink();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer-big">
      <div className="site-footer-grid">
        <div>
          <Logo />
          <p className="caption" style={{ marginTop: 12, maxWidth: 320 }}>Sakhi is the one place where your visits to different doctors and systems of medicine come together, in your own language and on your own device.</p>
        </div>
        <nav aria-label="Sakhi">
          <h2>Sakhi</h2>
          <ul>
            <li><a href="#how" onClick={e => { e.preventDefault(); go('how'); }}>How it works</a></li>
            <li><a href="#features" onClick={e => { e.preventDefault(); go('features'); }}>Features</a></li>
            <li><a href="#faq" onClick={e => { e.preventDefault(); go('faq'); }}>Questions</a></li>
            <li><Link to="/signup">Create my journal</Link></li>
            <li><Link to="/signin">Sign in</Link></li>
            <li><Link to="/signin" state={{ focus: 'demo' }}>Try a sample journal</Link></li>
          </ul>
        </nav>
        <nav aria-label="Help">
          <h2>Help</h2>
          <ul>
            <li><Link to="/help" className="urgent-link">Urgent help numbers</Link></li>
            <li><Link to="/now">Something urgent?</Link></li>
            <li><Link to="/how-it-works">How summaries work</Link></li>
            <li><Link to="/limits">What Sakhi does not cover</Link></li>
          </ul>
        </nav>
        <nav aria-label="Privacy">
          <h2>Privacy</h2>
          <ul>
            <li><a href="#privacy" onClick={e => { e.preventDefault(); go('privacy'); }}>How your data is kept</a></li>
            <li><Link to="/help">Emergency numbers</Link></li>
          </ul>
        </nav>
      </div>
      <div className="site-footer-bottom">
        <p className="caption" style={{ margin: 0 }}>Sakhi does not diagnose or advise treatment. In an emergency, call 112.</p>
        <p className="caption" style={{ margin: 0 }}>© {year} Sakhi</p>
      </div>
    </footer>
  );
}
