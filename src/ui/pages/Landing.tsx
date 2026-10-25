import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen, CircleCheck, FileText, HeartHandshake, Languages, ListChecks,
  Lock, PenLine, PhoneCall, SearchCheck, Stethoscope,
} from 'lucide-react';
import { jumpTo, SkipLink } from '../components/common.tsx';
import { PrimaryCta, SiteFooter, SiteHeader, useSectionLink } from '../components/SiteChrome.tsx';
import { AI_ENABLED } from '../../ai/client.ts';

export function Illustration() {
  return (
    <svg viewBox="0 0 720 420" role="img" aria-labelledby="ill-t" style={{ width: '100%', height: 'auto' }}>
      <title id="ill-t">Illustration: symptoms become a timeline, which becomes a one page brief.</title>
      <path d="M150 230 C 230 120, 300 320, 380 220 S 520 140, 560 210" fill="none" stroke="var(--blue-700)" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
      {[{ x: 30, y: 120, w: 150 }, { x: 60, y: 180, w: 120 }, { x: 20, y: 240, w: 140 }, { x: 70, y: 300, w: 100 }].map((p, i) => (
        <g key={i}>
          <rect x={p.x} y={p.y} width={p.w} height="40" rx="20" fill="var(--pink-100)" stroke="var(--pink-700)" strokeWidth="1.5" />
          <circle cx={p.x + 20} cy={p.y + 20} r="7" fill="var(--pink-500)" stroke="var(--pink-700)" />
          <rect x={p.x + 36} y={p.y + 16} width={p.w - 56} height="8" rx="4" fill="var(--pink-500)" opacity=".7" />
        </g>
      ))}
      <line x1="250" y1="250" x2="470" y2="250" stroke="var(--blue-700)" strokeWidth="2" />
      {[260, 290, 320, 380, 410, 460].map((x, i) => (
        <circle key={x} cx={x} cy={[230, 210, 238, 200, 222, 214][i]} r="8" fill="var(--blue-100)" stroke="var(--blue-700)" strokeWidth="2" />
      ))}
      {[350, 435].map(x => <circle key={x} cx={x} cy="250" r="5" fill="none" stroke="var(--ink-600)" strokeDasharray="2 2" />)}
      <g transform="translate(540 100)">
        <rect width="150" height="210" rx="10" fill="var(--white)" stroke="var(--ink-900)" strokeWidth="1.5" />
        <rect x="18" y="22" width="80" height="10" rx="5" fill="var(--ink-900)" />
        {[50, 70, 90, 110, 130, 150].map(y => <line key={y} x1="18" y1={y} x2={y % 40 === 10 ? 110 : 132} y2={y} stroke="var(--border)" strokeWidth="3" strokeLinecap="round" />)}
        <circle cx="118" cy="178" r="16" fill="var(--pink-500)" stroke="var(--pink-700)" />
        <path d="M110 178 l6 6 l10 -12" fill="none" stroke="var(--ink-900)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

const STEPS = [
  { icon: Stethoscope, t: 'After the visit', d: 'Write or speak what the doctor or practitioner said, in any language. Note what you were told to do and what was not answered.' },
  { icon: ListChecks, t: 'Keep track in between', d: 'Tick off advice as you do it, keep one list of everything you take from any kind of medicine, and log how you feel.' },
  { icon: FileText, t: 'Show a card at the next visit', d: 'Sakhi prepares a 30 second card: what changed since the last visit, what you take, what is still open, and what this doctor has not been told.' },
];

const FEATURES = [
  { icon: Stethoscope, t: 'What each doctor said', d: 'A short record after every visit, in your words, with the advice and the questions that were not answered.' },
  { icon: ListChecks, t: 'Advice you can tick off', d: 'Tests, medicines, follow ups and other advice, each marked done, not started or not sure. Overdue items are flagged.' },
  { icon: HeartHandshake, t: 'Everything you take, in one list', d: 'Modern medicine, Ayurveda, Homoeopathy, home remedies and more, side by side, wherever they came from.' },
  { icon: SearchCheck, t: 'Who you have told', d: 'Mark which doctor knows about each thing you take, so nothing is left out at the next visit.' },
  { icon: FileText, t: 'A card for your next visit', d: 'Show it on your phone or print it. Every number on it opens the records behind it.' },
  ...(AI_ENABLED ? [{ icon: Languages, t: 'Write it your way', d: 'Type a note in English, Hindi, Kannada or a mix, and Sakhi suggests the advice and questions in it. You check every one. Off until you switch it on.' }] : []),
  { icon: PenLine, t: 'Log how you feel', d: 'Symptoms, scores and what they stopped you doing, in under a minute, counted honestly between visits.' },
  { icon: Lock, t: 'Encrypted backup', d: 'Save a locked backup file you keep yourself, so a lost phone does not mean a lost record.' },
  { icon: PhoneCall, t: 'Help when something is urgent', d: 'A short check of warning signs that works without internet, and emergency numbers one tap away.' },
];

const FAQ = [
  { q: 'Is Sakhi free?', a: 'Yes. There is no subscription, no purchase and no minimum number of cycles before you can make a brief.' },
  { q: 'Do I need an account?', a: 'Yes, a simple one: your name, an email and a password. It is created on this device only and nothing is sent anywhere. You can also try a sample journal first without making one.' },
  { q: 'Will Sakhi tell me what is wrong?', a: 'No. Sakhi does not diagnose, judge whether advice was right, check medicines against each other or suggest doses. It keeps what you were told and what you did, so each doctor sees the whole picture.' },
  { q: 'Does Sakhi record my consultation?', a: 'No. Nothing is recorded during the visit. Afterwards you write down what you remember, in your own words.' },
  { q: 'Where are my entries kept?', a: 'Only in this browser on this device. Nothing you write is sent anywhere. To protect against a lost phone, save an encrypted backup file from Settings and keep it somewhere private.' },
  { q: 'Who can see my entries?', a: 'Only someone who can sign in to your journal on this device. Sign out when you are done if you share the device. A brief you print or share leaves Sakhi, so share it only with people you trust.' },
  { q: 'Can I use it on my phone?', a: 'Yes. Sakhi works in the browser on phones, tablets and computers.' },
  ...(AI_ENABLED ? [{ q: 'Can I write in Hindi or Kannada?', a: 'The screens are in English. With "Read my note with AI" switched on, you can write what the doctor said in Hindi, Kannada or a mix, and Sakhi suggests the advice and questions in it for you to check. Only that note and the date are sent to an online AI service to be read.' }] : []),
  { q: 'What if something is urgent?', a: 'Use "Something urgent?" on any screen, or call 112. Sakhi does not read your notes for emergencies, so never rely on a note to get help.' },
  { q: 'I do not have periods. Can I still use it?', a: 'Yes. Period questions are optional, and you can tell Sakhi that period timing does not apply to you. Symptoms such as tiredness, headaches, sleep or mood work the same way.' },
  { q: 'I forgot my password. What can I do?', a: 'Because your journal is only on this device, the password cannot be reset. On the sign in page you can delete the journal and start a new one.' },
  { q: 'How do I delete everything?', a: 'Go to Settings and privacy, then "Delete all my data". It removes everything from this browser in two steps.' },
];

export function Landing() {
  const go = useSectionLink();
  const loc = useLocation();
  useEffect(() => {
    const section = (loc.state as { section?: string } | null)?.section;
    if (section) setTimeout(() => jumpTo(section), 50);
  }, [loc.state]);

  return (
    <div className="app site">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} style={{ maxWidth: 'none', padding: 0 }}>
        <section className="hero">
          <div>
            <p className="eyebrow">Your care, connected</p>
            <h1>Every doctor, every visit, one record that is yours.</h1>
            <p className="lede">Write what each doctor told you, in your own language. Sakhi keeps it, connects it, and prepares a card for your next visit.</p>
            <div className="row" style={{ marginTop: 24 }}>
              <PrimaryCta />
              <Link to="/signin" state={{ focus: 'demo' }} className="btn btn-secondary">Try a sample journal</Link>
            </div>
            <p className="caption" style={{ marginTop: 12 }}>Already have a journal? <Link to="/signin">Sign in</Link></p>
            <ul className="trust-row" aria-label="At a glance">
              <li><CircleCheck size={16} aria-hidden="true" /> Free</li>
              <li><CircleCheck size={16} aria-hidden="true" /> Nothing sent online</li>
              <li><CircleCheck size={16} aria-hidden="true" /> Stays on your device</li>
              <li><CircleCheck size={16} aria-hidden="true" /> Works offline</li>
            </ul>
          </div>
          <Illustration />
        </section>

        <section className="band" aria-labelledby="why-h">
          <div className="landing-section">
            <h2 id="why-h" className="section-title">The gap is between visits.</h2>
            <div className="steps-3">
              <div><h3>Much of what is said is forgotten</h3><p className="muted">Visits are short, and a lot of what a doctor says is hard to remember by the time you get home.</p></div>
              <div><h3>Each doctor sees only part of it</h3><p className="muted">A new doctor rarely knows what the last one advised, what you did about it, or what you are already taking.</p></div>
              <div><h3>Care comes from many places</h3><p className="muted">Tablets from one doctor, a remedy from a practitioner and something from the chemist rarely end up in one list.</p></div>
            </div>
          </div>
        </section>

        <section className="landing-section" id="how" aria-labelledby="how-h">
          <h2 id="how-h" className="section-title">How it works</h2>
          <ol className="steps-3 numbered">
            {STEPS.map((s, i) => (
              <li key={s.t} className="card">
                <div className="row" style={{ gap: 12, marginBottom: 12 }}>
                  <span className="step-num" aria-hidden="true">{i + 1}</span>
                  <span className="icon-circle" style={{ margin: 0 }}><s.icon size={22} aria-hidden="true" /></span>
                </div>
                <h3>{s.t}</h3>
                <p className="muted" style={{ margin: 0 }}>{s.d}</p>
              </li>
            ))}
          </ol>
          <div className="row" style={{ marginTop: 24 }}>
            <PrimaryCta />
            <a href="#features" className="btn-link" onClick={e => { e.preventDefault(); go('features'); }}>See all features</a>
          </div>
        </section>

        <section className="band" id="features" aria-labelledby="feat-h">
          <div className="landing-section">
            <h2 id="feat-h" className="section-title">What you can do with Sakhi</h2>
            <div className="feature-grid">
              {FEATURES.map(f => (
                <div key={f.t} className="card">
                  <div className="icon-circle blue"><f.icon size={22} aria-hidden="true" /></div>
                  <h3>{f.t}</h3>
                  <p className="muted" style={{ margin: 0 }}>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="for-h">
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div>
              <h2 id="for-h" className="section-title"><HeartHandshake size={26} aria-hidden="true" /> Who it is for</h2>
              <ul className="tick-list">
                <li>Adults seeing more than one doctor or practitioner for the same problem</li>
                <li>Anyone using more than one kind of medicine, such as modern medicine with Ayurveda or a home remedy</li>
                <li>Anyone tracking tiredness, dizziness, pain, sleep, mood, hot flushes or a symptom of their own</li>
                <li>Anyone with periods that are heavy, painful or irregular, or symptoms that come and go between visits</li>
              </ul>
            </div>
            <div className="card-quiet">
              <h2 style={{ fontSize: 22 }}>What Sakhi is not</h2>
              <ul style={{ paddingLeft: 20 }}>
                <li>Not a diagnosis, and not a replacement for a doctor</li>
                <li>Never checks medicines against each other or suggests doses</li>
                <li>Not for emergencies: call 112</li>
                <li>Not for under 18s or pregnancy care</li>
              </ul>
              <Link to="/limits">Everything Sakhi does not cover</Link>
            </div>
          </div>
        </section>

        <section className="band" id="privacy" aria-labelledby="priv-h">
          <div className="landing-section">
            <h2 id="priv-h" className="section-title"><Lock size={26} aria-hidden="true" /> Your privacy</h2>
            <div className="feature-grid">
              <div className="card"><h3>Stays on your device</h3><p className="muted" style={{ margin: 0 }}>Your entries are kept in this browser on this device. Nothing you log is sent anywhere.</p></div>
              <div className="card"><h3>Your account stays here too</h3><p className="muted" style={{ margin: 0 }}>Your sign in is created on this device. We never see your email or password.</p></div>
              <div className="card"><h3>Delete any time</h3><p className="muted" style={{ margin: 0 }}>Remove everything from this browser in two steps, whenever you want.</p></div>
              <div className="card"><h3>You choose what to share</h3><p className="muted" style={{ margin: 0 }}>Nothing leaves Sakhi until you print or save your brief. A shared file leaves Sakhi's protection.</p></div>
            </div>
            {AI_ENABLED && <p className="caption" style={{ marginTop: 16 }}>If you switch on "Read my note with AI", the note you write is sent to an online AI service to be read. Nothing else is sent, and it is off until you switch it on.</p>}
          </div>
        </section>

        <section className="landing-section" id="faq" aria-labelledby="faq-h">
          <h2 id="faq-h" className="section-title">Questions</h2>
          <div className="faq">
            {FAQ.map(f => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-section">
          <div className="cta-band">
            <div>
              <h2 style={{ marginBottom: 8 }}>Ready for your next appointment?</h2>
              <p style={{ margin: 0 }}>After your next visit, write down what was said. It takes a minute.</p>
            </div>
            <div className="row">
              <PrimaryCta />
              <Link to="/signin" state={{ focus: 'demo' }} className="btn btn-secondary">Try a sample journal</Link>
            </div>
          </div>
          <div className="banner banner-info" style={{ marginTop: 24 }}>
            <BookOpen size={20} aria-hidden="true" />
            <p style={{ margin: 0 }}>Sakhi does not diagnose or advise treatment. If you feel seriously unwell, <Link to="/help">get urgent help</Link> or call 112.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
