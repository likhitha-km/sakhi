import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { BookOpen, ClipboardList, Ellipsis, Stethoscope, FileText, Globe, House, Info, LogOut, PhoneCall, Plus, ShieldCheck, WifiOff } from 'lucide-react';
import { CloseButton, Logo, Overlay, SafetyCard, SkipLink } from './common.tsx';
import { useSession } from '../hooks/session.tsx';
import { useAppData } from '../hooks/data.ts';

const NAV = [
  { to: '/home', label: 'Home', icon: House, end: true },
  { to: '/log', label: 'Log', icon: Plus },
  { to: '/visit/new', label: 'After the visit', icon: Stethoscope },
  { to: '/journal', label: 'Journal', icon: BookOpen },
  { to: '/card', label: 'Card', icon: FileText },
  { to: '/report', label: 'My report', icon: ClipboardList },
  { to: '/settings', label: 'Settings and privacy', icon: ShieldCheck },
];

export function Footer() {
  return (
    <footer className="site-footer no-print">
      <Link to="/help" className="urgent-link">Urgent help</Link>
      <Link to="/settings">Privacy</Link>
      <Link to="/limits">What Sakhi does not cover</Link>
      <Link to="/how-it-works">How summaries work</Link>
      <Link to="/">About Sakhi</Link>
      <span>Sakhi keeps your entries in this browser. It does not diagnose or advise treatment.</span>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOutTo, alert, setAlert, online } = useSession();
  const { settings } = useAppData();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const sample = settings?.syntheticLoaded;

  const signOut = () => signOutTo('/');

  return (
    <div className="app">
      <SkipLink />
      <aside className="sidebar no-print" aria-label="Main">
        <Link to="/home" aria-label="Sakhi, my journal home"><Logo /></Link>
        <Link to="/log" className="btn btn-primary log-btn">
          <Plus size={20} aria-hidden="true" /><span className="nav-text">Log symptoms</span>
        </Link>
        <Link to="/visit/new" className="btn btn-secondary log-btn" style={{ marginBottom: 12 }}>
          <Stethoscope size={20} aria-hidden="true" /><span className="nav-text">After the visit</span>
        </Link>
        <nav aria-label="Sections" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <n.icon size={20} aria-hidden="true" /><span className="nav-text">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/now" className="nav-link urgent-link"><PhoneCall size={20} aria-hidden="true" /><span className="nav-text">Something urgent?</span></NavLink>
          <NavLink to="/help" className="nav-link"><Info size={20} aria-hidden="true" /><span className="nav-text">Urgent help numbers</span></NavLink>
          <Link to="/" className="nav-link"><Globe size={20} aria-hidden="true" /><span className="nav-text">About Sakhi</span></Link>
          <button type="button" className="nav-link" style={{ border: 0, background: 'none', cursor: 'pointer', width: '100%' }} onClick={signOut}><LogOut size={20} aria-hidden="true" /><span className="nav-text">Sign out</span></button>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar no-print">
          <div className="row" style={{ gap: 8 }}>
            <Link to="/home" className="mobile-only" aria-label="Sakhi, my journal home"><Logo size={24} /></Link>
            {sample && <span className="pill pill-pink" title="These entries belong to a made up person">Sample data</span>}
            {!online && <span className="pill"><WifiOff size={14} aria-hidden="true" /> Offline. Everything still works.</span>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {user && (
              <span className="pill pill-blue hide-mobile">
                {user.name}{user.sample ? ' (sample)' : ''}
                <button type="button" className="btn-link" style={{ minHeight: 32, padding: '0 4px' }} onClick={signOut}>
                  <LogOut size={14} aria-hidden="true" /> Sign out
                </button>
              </span>
            )}
            {loc.pathname !== '/now' && <Link to="/now" className="btn btn-quiet btn-sm urgent-link">Something urgent?</Link>}
            <button type="button" className="icon-btn mobile-only" aria-label="More" aria-haspopup="dialog" onClick={() => setMore(true)}>
              <Ellipsis size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main id="main" tabIndex={-1}>
          {alert && loc.pathname !== '/now' && <SafetyCard result={alert} onDismiss={() => setAlert(null)} />}
          {children}
        </main>
        <Footer />
      </div>

      <nav className="bottom-bar no-print" aria-label="Sections">
        <NavLink to="/home" end><House size={20} aria-hidden="true" />Home</NavLink>
        <NavLink to="/log" className="bb-log"><Plus size={22} aria-hidden="true" />Log</NavLink>
        <NavLink to="/visit/new" className="bb-log bb-visit"><Stethoscope size={22} aria-hidden="true" />After visit</NavLink>
        <NavLink to="/card"><FileText size={20} aria-hidden="true" />Card</NavLink>
        <NavLink to="/journal"><BookOpen size={20} aria-hidden="true" />Journal</NavLink>
      </nav>

      <Overlay open={more} onClose={() => setMore(false)} label="More" variant="bottom">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>More</h2>
          <CloseButton onClick={() => setMore(false)} />
        </div>
        <nav aria-label="More" style={{ display: 'flex', flexDirection: 'column', gap: 4 }} onClick={() => setMore(false)}>
          <Link className="nav-link" to="/report"><ClipboardList size={20} aria-hidden="true" /> My report</Link>
          <Link className="nav-link" to="/settings"><ShieldCheck size={20} aria-hidden="true" /> Settings and privacy</Link>
          <Link className="nav-link urgent-link" to="/now"><PhoneCall size={20} aria-hidden="true" /> Something urgent?</Link>
          <Link className="nav-link" to="/help"><Info size={20} aria-hidden="true" /> Urgent help numbers</Link>
          <Link className="nav-link" to="/limits"><Info size={20} aria-hidden="true" /> What Sakhi does not cover</Link>
          <Link className="nav-link" to="/how-it-works"><Info size={20} aria-hidden="true" /> How summaries work</Link>
          <Link className="nav-link" to="/"><Globe size={20} aria-hidden="true" /> About Sakhi</Link>
          <button type="button" className="nav-link" style={{ border: 0, background: 'none', cursor: 'pointer', width: '100%' }} onClick={signOut}><LogOut size={20} aria-hidden="true" /> Sign out</button>
        </nav>
      </Overlay>
    </div>
  );
}
