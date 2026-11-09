import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Adds one new screen to the previous revision: node scripts/import-screen-revision.mjs <revision> <parentRevision>
// The revision folder holds the new PNG and screen-review.json; parent files are copied byte for byte.
const [revision, parentRevision] = process.argv.slice(2);
assert.ok(revision && parentRevision, 'Usage: import-screen-revision.mjs <revision> <parentRevision>');
const root = fileURLToPath(new URL('../', import.meta.url));
const screensDir = path.join(root, 'artifacts/screens');
const sourceDir = path.join(screensDir, revision);
const parentDir = path.join(screensDir, parentRevision);
const incoming = path.join(root, 'tools/design-verifier/profiles/chess/incoming', revision);
const base = 'http://127.0.0.1:43132';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const parentManifest = JSON.parse(fs.readFileSync(path.join(parentDir, 'manifest.json'), 'utf8'));
const parentAuditId = JSON.parse(fs.readFileSync(path.join(parentDir, 'verification.json'), 'utf8')).auditId;
const review = JSON.parse(fs.readFileSync(path.join(sourceDir, 'screen-review.json'), 'utf8'));
const { screen } = review;
const reportId = `review-${revision.split('-').pop()}`;

const state = await fetch(base + '/api/state').then(response => response.json());
assert.equal(state.profileId, 'chess');
assert.ok(!state.audits.some(audit => audit.title === review.title), 'Revision already imported');
assert.ok(state.audits.some(audit => audit.id === parentAuditId), 'Parent revision missing');

for (const artifact of parentManifest.artifacts) {
  const name = path.basename(artifact.path);
  const target = path.join(sourceDir, name);
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(parentDir, name), target, fs.constants.COPYFILE_EXCL);
  assert.equal(sha(fs.readFileSync(path.join(parentDir, name))), sha(fs.readFileSync(target)));
}
fs.mkdirSync(incoming, { recursive: false });
const files = [...parentManifest.artifacts.map(a => path.basename(a.path)), `${screen.artifact}.png`, 'screen-review.json'];
for (const file of files) fs.copyFileSync(path.join(sourceDir, file), path.join(incoming, file), fs.constants.COPYFILE_EXCL);

const artifacts = [
  ...parentManifest.artifacts.map(a => ({ ...a, path: `${revision}/${path.basename(a.path)}` })),
  { id: screen.artifact, label: screen.name, role: 'screen', path: `${revision}/${screen.artifact}.png` },
  { id: reportId, label: `${screen.name} · что изменено и ограничения`, role: 'report', path: `${revision}/screen-review.json` },
];
const screens = [...parentManifest.screens, { id: screen.id, name: screen.name, width: screen.width, height: screen.height, sourceIds: review.sourceIds, screenshotArtifact: screen.artifact }];
const sources = [
  ...parentManifest.sources.map(s => review.sourceIds.includes(s.id) ? { ...s, targetIds: [...s.targetIds, screen.id] } : s),
  ...review.newSources.map(s => ({ ...s, targetIds: [screen.id] })),
];
const checks = parentManifest.checks.map(check => {
  if (check.id === 'storage') return { ...check, artifactIds: artifacts.map(a => a.id) };
  if (check.id === 'ds') return { ...check, summary: `${check.summary} ${screen.name}: ${review.measurements.instances} экземпляров, шрифты ${review.measurements.fonts.join(' и ')}; непривязанных заливок в собственных слоях ${review.measurements.ownUnboundFills}.` };
  if (check.id === 'composition' || check.id === 'visual') return { ...check, artifactIds: [...new Set([...check.artifactIds, screen.artifact, reportId])] };
  return check;
});
const manifest = {
  ...parentManifest, title: review.title, parentAuditId, summary: review.summary,
  capturedAt: new Date(fs.statSync(path.join(sourceDir, `${screen.artifact}.png`)).mtimeMs).toISOString(),
  coverage: { expectedSourceFrames: sources.length, expectedTargetFrames: screens.length },
  sources, screens, checks, artifacts,
  findings: [...parentManifest.findings, ...review.findings.map(f => ({ ...f, artifactIds: f.artifactIds.filter(id => artifacts.some(a => a.id === id)) }))],
  limitations: [...parentManifest.limitations, ...review.limitations],
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
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(sha(bytes), sha(fs.readFileSync(path.join(sourceDir, path.basename(artifact.originalPath)))));
}
const proof = { auditId: result.id, parentAuditId: saved.parentAuditId, storage: 'PASS', design: saved.status, filesVerified: saved.artifacts.length, screens: saved.screens.length, sources: saved.sources.length, url: `${base}/?audit=${result.id}` };
fs.writeFileSync(path.join(sourceDir, 'verification.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
