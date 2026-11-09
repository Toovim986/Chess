import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Revision v7: content of v4 (screens 01–07, maps, overview) as the current revision, parent v6.
// Screens 08 «Партия v2» and 09 «Неоновый стол» stay in the v5/v6 history and in Figma.
const root = fileURLToPath(new URL('../', import.meta.url));
const revision = 'chess-ds-2026-10-27-v7';
const contentRevision = 'chess-ds-2026-10-27-v4';
const parentRevision = 'chess-ds-2026-10-27-v6';
const screensDir = path.join(root, 'artifacts/screens');
const sourceDir = path.join(screensDir, revision);
const contentDir = path.join(screensDir, contentRevision);
const incoming = path.join(root, 'tools/design-verifier/profiles/chess/incoming', revision);
const base = 'http://127.0.0.1:43132';
const title = 'Экраны по ГДД из Poker lib + экран партии · без столов 08–09';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const content = JSON.parse(fs.readFileSync(path.join(contentDir, 'manifest.json'), 'utf8'));
const parentAuditId = JSON.parse(fs.readFileSync(path.join(screensDir, parentRevision, 'verification.json'), 'utf8')).auditId;
const state = await fetch(base + '/api/state').then(r => r.json());
assert.equal(state.profileId, 'chess');
assert.ok(!state.audits.some(a => a.title === title), 'Revision already imported');
assert.ok(state.audits.some(a => a.id === parentAuditId), 'Parent revision missing');

fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(incoming, { recursive: false });
for (const artifact of content.artifacts) {
  const name = path.basename(artifact.path);
  fs.copyFileSync(path.join(contentDir, name), path.join(sourceDir, name));
  fs.copyFileSync(path.join(contentDir, name), path.join(incoming, name), fs.constants.COPYFILE_EXCL);
  assert.equal(sha(fs.readFileSync(path.join(contentDir, name))), sha(fs.readFileSync(path.join(incoming, name))));
}
const manifest = {
  ...content, title, parentAuditId, capturedAt: new Date().toISOString(),
  summary: 'Семь мобильных экранов, шесть карт передачи и обзор из v4. Столы 08 «Партия v2» и 09 «Неоновый стол» убраны из текущей ревизии; они сохранены в предыдущих ревизиях и в рабочем файле Figma.',
  artifacts: content.artifacts.map(a => ({ ...a, path: `${revision}/${path.basename(a.path)}` })),
};
fs.writeFileSync(path.join(sourceDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const response = await fetch(base + '/api/audits', {
  method: 'POST', headers: { Origin: base, 'X-Verifier-Token': state.csrf, 'Content-Type': 'application/json' },
  body: JSON.stringify(manifest),
});
const result = await response.json();
assert.equal(response.status, 201, JSON.stringify(result));
const stored = Buffer.from(await (await fetch(`${base}/api/audits/${result.id}/report`)).arrayBuffer());
assert.equal(sha(stored), result.manifestHash);
const saved = JSON.parse(stored);
for (const artifact of saved.artifacts) {
  const file = await fetch(`${base}/api/audits/${result.id}/artifacts/${artifact.id}`);
  assert.equal(file.status, 200);
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.equal(sha(bytes), artifact.sha256);
  assert.equal(sha(bytes), sha(fs.readFileSync(path.join(sourceDir, path.basename(artifact.originalPath)))));
}
const proof = { auditId: result.id, parentAuditId: saved.parentAuditId, storage: 'PASS', design: saved.status, filesVerified: saved.artifacts.length, screens: saved.screens.length, url: `${base}/?audit=${result.id}` };
fs.writeFileSync(path.join(sourceDir, 'verification.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
