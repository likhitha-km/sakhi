import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { db } from './db/db.ts';
import { useAppData } from './ui/hooks/data.ts';
import { useSession } from './ui/hooks/session.tsx';
import { Layout } from './ui/components/Layout.tsx';
import { SkipLink } from './ui/components/common.tsx';
import { SiteFooter, SiteHeader } from './ui/components/SiteChrome.tsx';
import { Landing } from './ui/pages/Landing.tsx';
import { SignIn, SignUp } from './ui/pages/Auth.tsx';
import { Home } from './ui/pages/Home.tsx';
import { Log } from './ui/pages/Log.tsx';
import { Journal } from './ui/pages/Journal.tsx';
import { Brief } from './ui/pages/Brief.tsx';
import { Now } from './ui/pages/Now.tsx';
import { Settings } from './ui/pages/Settings.tsx';
import { Help, Limits, HowItWorks } from './ui/pages/Static.tsx';
import { VisitNew } from './ui/pages/VisitNew.tsx';
import { VisitDetail } from './ui/pages/VisitDetail.tsx';
import { Disclosure } from './ui/pages/Disclosure.tsx';
import { CardList, CardPage, CardShow } from './ui/pages/Card.tsx';
import { Since } from './ui/pages/Since.tsx';
import { Backup } from './ui/pages/Backup.tsx';
import { ReplyReview } from './ui/pages/ReplyReview.tsx';
import { Report } from './ui/pages/Report.tsx';

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="app site">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} style={{ maxWidth: 860 }}>{children}</main>
      <SiteFooter />
    </div>
  );
}

function useStorageCheck() {
  const [ok, setOk] = useState(true);
  useEffect(() => { db.open().catch(() => setOk(false)); }, []);
  return ok;
}

export function App() {
  const { settings, account, loading } = useAppData();
  const { user, leaveTo, clearLeaveTo } = useSession();
  const storageOk = useStorageCheck();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  // The chosen page after signing out is used once; later visits to the journal ask to sign in.
  useEffect(() => { if (leaveTo && loc.pathname === leaveTo.path) clearLeaveTo(); }, [loc.pathname, leaveTo, clearLeaveTo]);

  if (!storageOk) return (
    <PublicShell>
      <h1>Sakhi cannot save in this browser</h1>
      <p>Your browser is blocking storage for this page, so entries would be lost. This can happen in some private windows or when site data is blocked in settings. Try a normal window, or allow site data for this page.</p>
      <p><Link to="/help">Urgent help numbers</Link> still work.</p>
    </PublicShell>
  );
  if (loading) return <div className="start-wrap" role="status">Opening your journal…</div>;

  // Signed in, agreed, and the account (or sample) still exists on this device.
  const authed = !!user && !!settings?.consentVersion && (user.sample ? !!settings.syntheticLoaded : !!account);
  const inApp = (el: ReactNode) => authed ? <Layout>{el}</Layout>
    : leaveTo ? <Navigate to={leaveTo.path} replace state={leaveTo.state} />
    : <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
  const open = (el: ReactNode) => authed ? <Layout>{el}</Layout> : <PublicShell>{el}</PublicShell>;

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/home" element={inApp(<Home />)} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/start" element={<Navigate to="/signup" replace />} />
      <Route path="/log" element={inApp(<Log />)} />
      <Route path="/journal" element={inApp(<Journal />)} />
      <Route path="/journal/:tab" element={inApp(<Journal />)} />
      <Route path="/visit/new" element={inApp(<VisitNew />)} />
      <Route path="/visit/:id" element={inApp(<VisitDetail />)} />
      <Route path="/disclosure" element={inApp(<Disclosure />)} />
      <Route path="/card" element={inApp(<CardList />)} />
      <Route path="/card/:id" element={inApp(<CardPage />)} />
      <Route path="/card/:id/show" element={authed ? <CardShow /> : <Navigate to="/signin" replace state={{ from: loc.pathname }} />} />
      <Route path="/since" element={inApp(<Since />)} />
      <Route path="/patterns" element={<Navigate to="/since" replace />} />
      <Route path="/settings/backup" element={inApp(<Backup />)} />
      <Route path="/r/:frag" element={inApp(<ReplyReview />)} />
      <Route path="/report" element={inApp(<Report />)} />
      <Route path="/brief" element={inApp(<Brief />)} />
      <Route path="/settings" element={inApp(<Settings />)} />
      <Route path="/now" element={open(<Now />)} />
      <Route path="/help" element={open(<Help />)} />
      <Route path="/limits" element={open(<Limits />)} />
      <Route path="/how-it-works" element={open(<HowItWorks />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
