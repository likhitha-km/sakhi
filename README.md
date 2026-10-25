# Sakhi

A private, on-device companion that helps a woman carry what was said at one medical visit into the next one, across every doctor and system of medicine she uses.

### 🔗 Demo URL: **[animated-profiterole-424bfc.netlify.app](https://animated-profiterole-424bfc.netlify.app)**

## The problem

Many women in India see several clinicians for the same concern: a gynaecologist, a general physician, an Ayurveda or homeopathy practitioner, a pharmacist. Each visit starts almost from zero. Advice is half remembered, tests are not done for reasons nobody asks about, and one clinician often does not know what another has prescribed. Period and symptom apps keep logs, and some make a one-off report, but the thread between visits (what was advised, what actually happened, what is still unanswered) usually lives in her memory, a notes app or a WhatsApp chat.

Sakhi is for adult women managing ongoing gynaecological or general health concerns who want to arrive at each visit prepared, and leave with the advice written down in their own words.

## What Sakhi does

Sakhi keeps a **visit loop**: prepare, visit, record, follow through, return.

- **After a visit**, she writes down what was said, in her own words and language, and turns it into advice items (tests, medicines, follow-ups, referrals) and questions that were not answered.
- **Between visits**, she marks each piece of advice as done, not started, not done (with her own reason, such as cost or worry about side effects) or not sure. Overdue is worked out from the date.
- **Before the next visit**, Sakhi prepares a short **Consult Card** for that clinician: what has changed since she last saw them, what she takes now from any system of medicine and whether she has told this clinician about it, the status of earlier advice, concerns still open, and up to two questions to ask.

What makes it different in intent is that the record is hers, crosses clinicians and systems of medicine, and carries follow-through forward. It never judges or scores her. We have not run a user study, and we do not claim it improves clinical outcomes.

## Key features

- **Consult Card** with a large-text show mode for handing a phone across the desk, a one-page print, and a read-only shared link. Every number on the screen card opens the records behind it, and each advice item or concern shows where it came from (written by her, drafted with AI and confirmed by her, or received through a reply link).
- **What has changed** since she last saw this clinician: their advice last time and what happened to it, visits to other clinicians in between, treatments started or stopped. For a clinician she has not seen, it covers the last 3 months.
- **What I take and who I have told**: one list across modern medicine, Ayurveda, homeopathy and others, with a record of which clinician she has told about each item. Anything not recorded shows as "not marked as told", never as "hidden".
- **Advice follow-through** with her own reasons, carried to the next card. Things she was not sure about become questions. Status changes can be undone.
- **Symptom and daily log** with counts of the days each symptom appeared and the days it limited her. It shows no trend words or medians.
- **My report**: everything she has logged, or a chosen date range, as a printable report. She can switch sections off.
- **Urgent warning signs** from structured answers (never from free text), with emergency numbers.
- **Calendar file** (`.ics`) for visits and dated advice. Reminder titles stay generic unless she switches details on.
- **Clinician reply link (prototype)**: a clinician can send back advice and a next visit date. She reviews each line before anything is saved.
- **Encrypted backup and restore** with a passphrase.
- **Optional life stage** (perimenopause, after menopause, after a hysterectomy, or "I'd rather not say"). It only changes which prompts appear. Sakhi never infers it.
- **Optional AI helpers** (off unless the local helper is running): drafting log entries or visit advice from a note written in English, Hindi, Kannada or a mix, and a summary at the top of the report. Every draft is shown to her to confirm or edit first.

## An example journey

The built-in sample journal ("Ananya", made-up data) shows the loop:

1. Three weeks ago Ananya saw **Dr Rao** (modern medicine). She recorded three pieces of advice: a blood test, an iron tablet every morning, and a follow-up in two weeks. She also noted that her stomach pain was not addressed.
2. Since then she has started iron tablets and an Ayurvedic herbal powder from **Vaidya Sharma**. She marked the iron as done. The blood test is still not started, and the follow-up date has passed.
3. She has a visit with **Dr Mehta** tomorrow. Home shows one next step: *prepare the card*.
4. The card for Dr Mehta shows her care in the last 3 months (the visit to Dr Rao, the two treatments she started), what she takes with "not marked as told" beside the iron tablets, the overdue follow-up, the open stomach pain concern, and a question about using the two treatments together.
5. At the visit she opens show mode and hands over her phone, or shares a link. Afterwards she records what Dr Mehta said, and the loop starts again.

## Technology and architecture

- **Frontend:** React 19, TypeScript, Vite, React Router (hash routing, so the built app runs from any static folder).
- **Storage:** IndexedDB in the browser through Dexie, with Zod validation on every write and restore. There is no server database.
- **Cryptography:** Web Crypto API only. The account password is a salted PBKDF2 hash. Backups use PBKDF2-SHA256 (600,000 rounds) and AES-256-GCM.
- **Shared links:** the card text is compressed into the part of the link after `#`, which browsers do not send to servers. The viewer page opens no database.
- **Optional AI helper:** a small Node.js server in `proxy/` on `127.0.0.1:8787` that keeps the API key off the web page and calls an open-weight model (`Qwen/Qwen3-30B-A3B-Instruct-2507`) on Nebius Token Factory. The app checks every response: drafts must quote her own words, and added numbers or diagnostic wording are rejected.
- **Tests:** Vitest with `fake-indexeddb`.

```
src/
  types/     data shapes
  db/        storage, validation, accounts, encrypted backup
  visits/    visit loop logic and the Consult Card model
  loop/      next step, carry-forward, calendar file
  engine/    counts and summaries (pure functions)
  safety/    urgent warning sign rules
  brief/     brief and suggested questions
  report/    My report
  share/     shared link and reply link encoding
  viewer/    read-only shared card page
  ai/        checks shared by the app and the AI helper
  fixtures/  made-up sample journals
  ui/        screens, components, design tokens
proxy/       optional local AI helper
tests/       automated tests
docs/        AI language test notes and script
```

## Run it locally

Requirements: **Node.js 22.18 or newer** (developed on Node 26) and npm.

```bash
npm install
npm run dev        # opens on http://localhost:5173
```

The app works fully without any configuration or API key. On the sign-in page, choose **Try a sample journal** to explore made-up data:

| Sample | Email | Password | What it shows |
| --- | --- | --- | --- |
| Ananya | `ananya.demo@sakhi.test` | `demo-password` | 8 weeks of entries, visits, advice, treatments from two systems of medicine, a visit planned for tomorrow |
| Farah | `farah.demo@sakhi.test` | `demo-password` | only 5 logged days, so most summaries say there is not enough data |

The sample sign-in refuses to run if the browser already holds a real journal. You can also create your own journal; it is stored only in that browser.

### Configuration (optional)

Front-end settings live in `.env`. Copy the example if you want to change a default:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_AI_ENABLED` | `true` | Set to `false` to remove the AI helpers completely |
| `VITE_AI_PROXY_URL` | `http://127.0.0.1:8787` | Address of the local AI helper |
| `VITE_DEMO_LOGIN` | `true` | Set to `false` to hide the sample sign-in |

### Optional AI helper

The AI features appear only when the helper is running and has a key. The key stays in `proxy/.env`, which is git-ignored, and never reaches the browser.

```bash
cp proxy/.env.example proxy/.env   # then set NEBIUS_API_KEY to your own key
npm run proxy                      # http://127.0.0.1:8787
```

`NEBIUS_MODEL` can override the model. The helper accepts requests only from `localhost` pages and logs status codes and timings, never content. It works with the locally run app, not from a static host.

## Tests and production build

```bash
npm test             # all automated tests
npm run test:tz      # the same tests in two time zones
npm run build        # type check and production build into dist/
npm run preview      # serve the build on http://localhost:4173
```

The tests cover the counting engine, the visit loop and the Consult Card, sharing and reply links, encrypted backup and restore, accounts, safety rules, AI response checks and the report. Expected values for the sample data were written before the code and are checked by the tests. `docs/ai-language-test/` holds 20 made-up notes and a script (`node docs/ai-language-test/run.mjs`, with the AI helper running) for a small language test of the AI note reader. It makes no accuracy claim.

## Privacy, AI and medical safety

- **On the device.** Entries, visits, advice and settings stay in the browser's IndexedDB and are never sent to a server. They are not encrypted at rest. Clearing browser data or using a private window can erase them, so the app offers an encrypted backup file.
- **Accounts are local.** The sign-in keeps other people out of the journal on a shared device. It cannot be reset remotely, and it is not encryption.
- **Shared links** can be read by anyone who has them, and chat apps may keep a copy. Their expiry is advisory, and a link cannot be withdrawn. The app says this before she makes one.
- **AI is optional and limited.** Only the note being read (or, for the report summary, her logged records with clinician names replaced and her name removed) is sent to the model, and only with her consent. Nothing is saved until she confirms it. AI never changes counts or urgent warnings. AI-drafted items stay labelled as drafts she confirmed, not as verified information.
- **No medical decisions.** Sakhi does not diagnose, recommend treatment, suggest doses, check medicines against each other or judge a clinician's advice. It does not record consultations. The disclosure record shows what she noted, not what a clinician knows.
- **Not for** under 18s, pregnancy care, or keeping records for someone else.

## Limitations and future work

- No clinician has reviewed the urgent warning signs or the suggested questions. They are based on public NHS, NICE and CDC guidance and need clinical review before real use.
- No user research or usability study has been done. The sample data shows the software follows its rules, not that it is clinically useful.
- The interface is in English only. The AI note reader accepts Hindi and Kannada, but its quality in those languages has not been checked by fluent speakers.
- Data lives in one browser, with no sync between devices beyond the backup file.
- The clinician reply link is a prototype.
- On small phones, show mode keeps every key section at full text size and scrolls instead of shrinking. A very full card may print on more than one page.
- Possible next steps include interface translations, clinical review of the safety content, user testing with women and clinicians, and an installable offline app.

## Acknowledgements

Built for the recHERsion 2026 hackathon. Sakhi uses open-source software: React, Vite, TypeScript, Dexie, Zod, Lucide icons, and the Source Serif 4 and Figtree fonts through Fontsource (MIT, Apache 2.0 and SIL Open Font License). The optional AI helper uses Nebius Token Factory. Warning sign content draws on public guidance from the NHS, NICE and CDC.

## Licence

No licence has been chosen for this repository yet. Until one is added, the code is published for viewing and evaluation only, and no permission to reuse it is granted.

All health data in this repository is made up. No real patient information is included.
