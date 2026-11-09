import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Read-only static copy of the verifier for public hosting (GitHub Pages).
// Usage: node scripts/build-public-snapshot.mjs [outDir]   (verifier must run on :43132)
const root = fileURLToPath(new URL('../', import.meta.url));
const pub = path.join(root, 'tools/design-verifier/verifier/public');
const out = path.resolve(process.argv[2] || path.join(root, 'public-site'));
const base = 'http://127.0.0.1:43132';
const hidden = '[скрыто]';

// Internal identifiers that must not appear on a public page.
const secrets = [
  'QZNrOb57obLvLAadEMSjV3', 'XSrnXoAtfXrNMIH1mFPjGc', '3XFu7HJrZfIFVVmlVhhi85', 'mKX13PSo2vqwCXCBQJiOi8', 'fSqSKlq7zAlmMcktBSHbRr',
  '13PcZ5cpqjyRrojoIIVhKse6igOlLrGs6IpZnLpEHK-Q',
];
const scrub = text => {
  let s = text;
  for (const key of secrets) s = s.split(key).join(hidden);
  s = s.replace(/https?:\/\/(?:www\.)?(?:figma\.com|docs\.google\.com)[^\s"'<>)]*/g, hidden);
  s = s.replace(/[A-Za-z]:\\\\(?:[^"\\]|\\\\)*/g, hidden);
  return s;
};

fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(out)) fs.rmSync(path.join(out, name), { recursive: true, force: true });
const copy = (from, to) => fs.cpSync(path.join(pub, from), path.join(out, to), { recursive: true });
for (const f of ['index.html', 'app.js', 'chess-workspace.js', 'chess-workspace.css', 'dashboard.js', 'design-audits.js', 'knowledge-view.js', 'profile-view.js', 'screen-map-view.js', 'viewport-review.js', 'styles.css', 'theme.css', 'refinements.css']) copy(f, f);
copy('assets', 'assets');
fs.rmSync(path.join(out, 'assets/README.md'), { force: true }); // notes about the internal Figma reference
copy('chess/ds', 'chess/ds'); // third party reference screenshots (chess/references) are deliberately left out

// Data: only the current revision, no notes, events, runs or write token.
const state = await fetch(base + '/api/state').then(r => r.json());
const latest = state.audits.find(a => a.kind === 'revision');
assert.ok(latest, 'No revision to publish');
const publicState = { ...state, csrf: '', notes: [], events: [], runs: [], requests: [], audits: [latest], server: { ...state.server, activeRun: null } };
const write = (rel, text) => { const file = path.join(out, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
write('data/state.json', scrub(JSON.stringify(publicState)));
const detail = await fetch(`${base}/api/audits/${latest.id}`).then(r => r.json());
write(`data/audits/${latest.id}.json`, scrub(JSON.stringify(detail)));
let files = 0;
for (const artifact of detail.artifacts) {
  const response = await fetch(`${base}/api/audits/${latest.id}/artifacts/${artifact.id}`);
  assert.equal(response.status, 200, artifact.id);
  const bytes = Buffer.from(await response.arrayBuffer());
  const isJson = /json/.test(response.headers.get('content-type') || '');
  const target = path.join(out, `data/audits/${latest.id}/${artifact.id}.${isJson ? 'json' : 'png'}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, isJson ? scrub(bytes.toString('utf8')) : bytes);
  files++;
}

// Page edits for a static, read-only copy.
const edit = (file, fn) => { const p = path.join(out, file); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
const replaceOnce = (text, from, to) => { assert.ok(text.includes(from), `Missing: ${from.slice(0, 60)}`); return text.replace(from, to); };
edit('index.html', t => {
  t = t.replace(/(href|src)="\/(?!\/)/g, '$1="');
  t = t.replace(/url\('\/assets\//g, "url('assets/");
  t = replaceOnce(t, '<script type="module" src="app.js"></script>', '<script src="snapshot.js"></script><script type="module" src="app.js"></script>');
  t = replaceOnce(t, 'Данные хранятся на этом компьютере', 'Статичный снимок для просмотра. Только чтение');
  t = t.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="robots" content="noindex">');
  return t;
});
for (const css of ['theme.css', 'styles.css', 'refinements.css']) edit(css, t => t.replace(/url\((['"]?)\/assets\//g, 'url($1assets/'));
edit('assets/fonts.css', t => t.replace(/url\((['"]?)\/assets\//g, 'url($1'));
edit('app.js', t => {
  t = replaceOnce(t, ", refs: 'Референсы'", '');
  t = replaceOnce(t, 'Сервис на связи', 'Снимок для просмотра');
  return t;
});
edit('chess-workspace.js', t => replaceOnce(t, "const external = (url, text, cls = 'text-link') => ", "const external = (url, text, cls = 'text-link') => /figma\\.com|docs\\.google\\.com|\\[скрыто\\]/.test(url) ? '' : "));
for (const file of fs.readdirSync(out).filter(f => f.endsWith('.js'))) edit(file, t => secrets.reduce((acc, key) => acc.split(key).join(hidden), t));
write('.nojekyll', '');
write('snapshot.js', `// Maps the verifier's server routes onto the static files of this snapshot.
(() => {
  const dir = location.pathname.replace(/[^/]*$/, '');
  const rewrite = url => {
    if (typeof url !== 'string' || url[0] !== '/' || url.startsWith('//')) return url;
    const path = url.split('?')[0];
    let m;
    if (path === '/api/state') return dir + 'data/state.json';
    if ((m = /^\\/api\\/audits\\/([^/]+)\\/artifacts\\/([^/]+)$/.exec(path))) return dir + 'data/audits/' + m[1] + '/' + m[2] + (/^(ds-audit|handoff-map|review)/.test(decodeURIComponent(m[2])) ? '.json' : '.png');
    if ((m = /^\\/api\\/audits\\/([^/]+)$/.exec(path))) return dir + 'data/audits/' + m[1] + '.json';
    if (path.startsWith('/api/')) return dir + 'data/missing.json';
    return dir + path.slice(1);
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => typeof input === 'string' ? nativeFetch(rewrite(input), init && init.method && init.method !== 'GET' ? { ...init, method: 'GET', body: undefined } : init) : nativeFetch(input, init);
  const fix = el => { for (const attr of ['src', 'href', 'data-src']) { const v = el.getAttribute && el.getAttribute(attr); if (!v || v[0] !== '/' || v.startsWith('//') || (dir !== '/' && v.startsWith(dir))) continue; const next = rewrite(v); if (next !== v) el.setAttribute(attr, next); } };
  const fixTree = node => { if (node.nodeType !== 1) return; fix(node); node.querySelectorAll && node.querySelectorAll('[src],[href],[data-src]').forEach(fix); };
  new MutationObserver(list => list.forEach(r => r.type === 'attributes' ? fix(r.target) : r.addedNodes.forEach(fixTree)))
    .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href', 'data-src'] });
})();
`);
console.log(JSON.stringify({ out, revision: latest.title, artifacts: files }, null, 2));
