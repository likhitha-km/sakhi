import { Link } from 'react-router-dom';
import { PhoneCall } from 'lucide-react';
import { GATES } from '../../engine/gates.ts';

// Display text from the urgent help list, reused on the log screen. Not a rule.
export const BLEEDING_AFTER_PERIODS_STOPPED = 'Any bleeding after your periods have stopped for more than a year, even once or a small amount';

export function Help() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Urgent help</h1>
      <div className="banner banner-alert">
        <PhoneCall size={24} color="var(--alert-700)" aria-hidden="true" />
        <div>
          <h2 style={{ marginBottom: 4 }}>Emergency: call 112</h2>
          <p style={{ margin: 0 }}>For chest pain, trouble breathing, fainting, very heavy bleeding or severe pain, get urgent help whatever Sakhi says.</p>
          <a className="btn btn-danger" style={{ marginTop: 12 }} href="tel:112"><PhoneCall size={18} aria-hidden="true" /> Call 112</a>
        </div>
      </div>
      <section className="card section">
        <h2>If you are struggling or thinking about hurting yourself</h2>
        <p>Tele-MANAS is a free mental health helpline from the Government of India, open 24 hours a day, every day.</p>
        <div className="row">
          <a className="btn btn-secondary" href="tel:14416">Call 14416</a>
          <a className="btn btn-secondary" href="tel:18008914416">Call 1-800-891-4416</a>
        </div>
        <p className="caption" style={{ marginTop: 8 }}>If you are in danger right now, call 112.</p>
      </section>
      <section className="card section">
        <h2>See a doctor soon if you have</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li>Heavy periods that affect your daily life</li>
          <li>Severe period pain</li>
          <li>Bleeding between periods or after sex</li>
          <li>Heavy periods with pain when passing urine or stool, or during sex</li>
          <li>{BLEEDING_AFTER_PERIODS_STOPPED}</li>
          <li>A lump or swelling in your breast, chest or armpit, or any change to your breast or nipple that is not normal for you</li>
        </ul>
        <p className="caption">Sakhi does not look for these in your entries. This list is here so you always have it.</p>
      </section>
      <p><Link to="/now">Check what is happening now</Link></p>
    </div>
  );
}

export function Limits() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1>What Sakhi does not cover</h1>
      <p className="muted">Sakhi is a journal that helps you prepare for an appointment. It is honest about what it cannot do.</p>
      <ul className="stack" style={{ paddingLeft: 20 }}>
        <li><strong>No diagnosis.</strong> It never names a condition, gives a score for an illness or says what is normal.</li>
        <li><strong>No treatment advice.</strong> It never says what to take, stop or change. Always ask the person who advised a treatment before changing it.</li>
        <li><strong>No judging of test results or readings.</strong> You can record blood pressure, blood sugar or any test, and Sakhi shows it exactly as you typed it.</li>
        <li><strong>No emergency detection from notes.</strong> Notes are never checked. Use <Link to="/now">Something urgent?</Link> or call 112.</li>
        <li><strong>No pregnancy or after-birth care.</strong> You can still log symptoms, and the urgent check asks about pregnancy.</li>
        <li><strong>No cancer screening.</strong></li>
        <li><strong>Not for under 18s.</strong></li>
        <li><strong>Not for keeping records for someone else.</strong> Each journal is for one person.</li>
        <li><strong>No syncing between devices.</strong> Your journal and your sign in live only in this browser, and a forgotten password cannot be reset. A backup file can move your entries.</li>
        <li><strong>English screens only.</strong> The optional "Read my note with AI" helper can read visit notes in Hindi, Kannada or a mix, and you check every suggestion.</li>
        <li><strong>No checking of medicines against each other, and no doses.</strong> Sakhi lists what you take and who you have told. It never says whether things are safe together or how much to take.</li>
        <li><strong>No recording of consultations, and no judging of advice.</strong> You write down what you remember. Sakhi never says whether advice was right.</li>
      </ul>
      <p className="caption">The urgent warning signs and suggested questions are based on public NHS, NICE and CDC guidance. They have not yet been reviewed by a clinician for use in India.</p>
    </div>
  );
}

export function HowItWorks() {
  const G = GATES;
  return (
    <div style={{ maxWidth: 760 }}>
      <h1>How summaries work</h1>
      <p className="muted">Every number Sakhi shows is a simple count of your own entries. Each summary waits until it has enough entries, and tells you what is missing instead of guessing.</p>
      <div className="table-wrap card section">
        <table>
          <thead><tr><th scope="col">Summary</th><th scope="col">What it counts</th><th scope="col">Shown when</th></tr></thead>
          <tbody>
            <tr><td>Days with an entry</td><td>Days with at least one entry, including "Nothing to report"</td><td>Always</td></tr>
            <tr><td>Symptom days</td><td>Days with a score of 1 or more. Two entries on one day count once.</td><td>At least 1 day</td></tr>
            <tr><td>Middle score</td><td>The score in the middle when your days are lined up from lowest to highest</td><td>At least {G.medianMinDays} days with the symptom</td></tr>
            <tr><td>Effect on daily life</td><td>Days where you ticked each effect</td><td>At least 1 day</td></tr>
            <tr><td>Bleeding</td><td>Bleeding days, and how many had a heavier bleeding sign</td><td>At least 1 bleeding day</td></tr>
            <tr><td>Latest 2 weeks and the 2 weeks before</td><td>Middle score in each {G.recentPrev.windowDays} day stretch</td><td>Each stretch has {G.recentPrev.minObservedDays} logged days and {G.recentPrev.minPresentDays} days with the symptom</td></tr>
            <tr><td>Timing around periods</td><td>Days with the symptom from {G.peri.daysBefore} days before to {G.peri.daysAfter} days after a period start</td><td>{G.peri.minStarts} period starts and {G.peri.minOccurrences} days with the symptom</td></tr>
            <tr><td>Gaps between periods</td><td>Days between recorded period starts</td><td>{G.intervalMinStarts} period starts</td></tr>
            <tr><td>Symptoms on the same day</td><td>Days two symptoms were both recorded</td><td>Each on {G.overlapMinDays} days, and {G.overlapMinCoDays} days together</td></tr>
          </tbody>
        </table>
      </div>
      <ul className="stack" style={{ paddingLeft: 20 }}>
        <li>Days you did not log are left out. They are never treated as days without symptoms.</li>
        <li>Tap any number on your card or on "Since last visit" to see exactly which entries or records it counts.</li>
        <li>Summaries cover the last 4 or 8 weeks, ending on your latest entry. A period start outside that time is not used.</li>
        <li>Being recorded together, or around a period, does not mean one thing causes another.</li>
        <li>The window around a period start is a simple guide chosen for Sakhi, not a medical rule.</li>
      </ul>
    </div>
  );
}
