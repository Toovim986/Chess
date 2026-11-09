import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Revision v5 = v4 + screen 08 «Партия v2» (по референсу пользователя). Parent: v4.
const root = fileURLToPath(new URL('../', import.meta.url));
const revision = 'chess-ds-2026-10-27-v5';
const parentRevision = 'chess-ds-2026-10-27-v4';
const screensDir = path.join(root, 'artifacts/screens');
const sourceDir = path.join(screensDir, revision);
const parentDir = path.join(screensDir, parentRevision);
const incoming = path.join(root, 'tools/design-verifier/profiles/chess/incoming', revision);
const base = 'http://127.0.0.1:43132';
const title = 'Партия v2 по референсу + экраны по ГДД из Poker lib';
const screenId = '33:1415';
const screenArtifact = '08-game-v2';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const parentManifest = JSON.parse(fs.readFileSync(path.join(parentDir, 'manifest.json'), 'utf8'));
const parentAuditId = JSON.parse(fs.readFileSync(path.join(parentDir, 'verification.json'), 'utf8')).auditId;
const review = JSON.parse(fs.readFileSync(path.join(sourceDir, 'review-v5.json'), 'utf8'));
const dsUsed = review.sourceIds;

const state = await fetch(base + '/api/state').then(response => response.json());
assert.equal(state.profileId, 'chess');
assert.ok(!state.audits.some(audit => audit.title === title), 'Revision already imported');
assert.ok(state.audits.some(audit => audit.id === parentAuditId), 'Parent revision missing');

// The v5 folder holds every file of the revision; parent files are copied byte for byte.
for (const artifact of parentManifest.artifacts) {
  const name = path.basename(artifact.path);
  const target = path.join(sourceDir, name);
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(parentDir, name), target, fs.constants.COPYFILE_EXCL);
  assert.equal(sha(fs.readFileSync(path.join(parentDir, name))), sha(fs.readFileSync(target)));
}
const newFiles = [`${screenArtifact}.png`, 'review-v5.json'];
fs.mkdirSync(incoming, { recursive: false });
const files = [...parentManifest.artifacts.map(a => path.basename(a.path)), ...newFiles];
for (const file of files) fs.copyFileSync(path.join(sourceDir, file), path.join(incoming, file), fs.constants.COPYFILE_EXCL);

const artifacts = [
  ...parentManifest.artifacts.map(a => ({ ...a, path: `${revision}/${path.basename(a.path)}` })),
  { id: screenArtifact, label: '08 · Партия v2 · по референсу', role: 'screen', path: `${revision}/${screenArtifact}.png` },
  { id: 'review-v5', label: 'Партия v2 · что изменено и ограничения', role: 'report', path: `${revision}/review-v5.json` },
];
const screens = [
  ...parentManifest.screens,
  { id: screenId, name: '08 · Партия v2 · по референсу', width: 375, height: 812, sourceIds: dsUsed, screenshotArtifact: screenArtifact },
];
const sources = parentManifest.sources.map(s => dsUsed.includes(s.id) ? { ...s, targetIds: [...s.targetIds, screenId] } : s);
const screenIds = screens.filter(s => !/^Карта|^Обзор/.test(s.name)).map(s => s.screenshotArtifact);
const checks = parentManifest.checks.map(check => {
  if (check.id === 'storage') return { ...check, artifactIds: artifacts.map(a => a.id) };
  if (check.id === 'ds') return { ...check, summary: `${check.summary} Экран 08: ${review.measurements.instances} экземпляров, шрифты ${review.measurements.fonts.join(' и ')}; ${review.measurements.unboundFills} непривязанных заливок, все внутри компонентов библиотеки.` };
  if (check.id === 'composition' || check.id === 'visual') return { ...check, artifactIds: [...new Set([...check.artifactIds, screenArtifact, 'review-v5'])] };
  return check;
});
const manifest = {
  ...parentManifest, title, parentAuditId, capturedAt: new Date(fs.statSync(path.join(sourceDir, `${screenArtifact}.png`)).mtimeMs).toISOString(),
  summary: 'Новая версия экрана партии по референсу пользователя: лавровые рамки аватаров, плашки игроков, доска с внешними координатами, крупная золотая «Ваш ход» с короной. Собрана из экземпляров Poker lib; предыдущие семь экранов, шесть карт передачи и обзор сохранены из v4.',
  target: { fileKey: 'QZNrOb57obLvLAadEMSjV3', pageId: '0:1' },
  coverage: { expectedSourceFrames: sources.length, expectedTargetFrames: screens.length },
  sources, screens, checks, artifacts,
  findings: [...parentManifest.findings, ...review.findings],
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
