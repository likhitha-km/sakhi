import '@fontsource-variable/source-serif-4/wght.css';
import '@fontsource-variable/figtree/wght.css';
import './ui/design/tokens.css';
import './ui/design/base.css';

// A shared card link (#/c/...) opens a separate, storage free viewer, so a clinician's device never gets
// a Sakhi database. Everything else opens the app.
const card = /^#\/c\/(.+)$/.exec(location.hash);
if (card) void import('./viewer/main.tsx').then(m => m.mountViewer(card[1]));
else void import('./appMain.tsx').then(m => m.mountApp());
window.addEventListener('hashchange', () => { if (/^#\/c\//.test(location.hash) !== !!card) location.reload(); });
