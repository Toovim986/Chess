import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createVerifier } from '../server.mjs';
import { saveDesignAudit } from '../audit-store.mjs';
import { renderProfileRack, renderEmptyArchive } from '../public/profile-view.js';
import { renderDesignAudits } from '../public/design-audits.js';
import { renderKnowledge } from '../public/knowledge-view.js';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-portable-'));
const post = (base, app, route, value) => fetch(base + route, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'X-Verifier-Token': app.token }, body: JSON.stringify(value) });
function fixture(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'report.json'), '{"status":"FAIL"}\n');
  fs.writeFileSync(path.join(root, 'screen.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII=', 'base64'));
  return { schema: 'verifier-design-audit/1', kind: 'archive', title: 'Measured revision', summary: 'Imported evidence, not a new execution.', capturedAt: '2026-09-14T07:12:57.927Z',
    source: { fileKey: 'design-library', pageId: '1:1' }, target: { fileKey: 'game-file', pageId: '2:1' },
    coverage: { expectedSourceFrames: 1, expectedTargetFrames: 1 },
    screens: [{ id: '2:2', name: 'Screen', width: 1, height: 1, sourceIds: ['1:2'], screenshotArtifact: 'screen' }],
    sources: [{ id: '1:2', name: 'Component', targetIds: ['2:2'] }],
    checks: [{ id: 'grid', name: 'Grid', status: 'FAIL', summary: 'Known deviation.', artifactIds: ['report'] }],
    artifacts: [{ id: 'report', path: 'report.json', label: 'Report', role: 'report' }, { id: 'screen', path: 'screen.png', label: 'Screen', role: 'screenshot' }],
    findings: [], limitations: ['Design system is not connected.'] };
}

test('empty Chess profile has no Poker evidence, no executable case and an honest INCOMPLETE UI', async t => {
  const root = temp(), app = createVerifier({ profileId: 'chess', dataDir: path.join(root, 'data'), importRoot: path.join(root, 'incoming') });
  const base = await app.listen(0); t.after(() => app.close());
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.profileId, 'chess'); assert.equal(state.sourceFile, ''); assert.equal(state.targetFile, '');
  assert.deepEqual(state.cases, []); assert.deepEqual(state.boards, []); assert.deepEqual(state.audits, []);
  assert.equal(state.viewportReview.result.status, 'INCOMPLETE'); assert.equal(state.legacyPokerArchive, false);
  assert.equal((await fetch(base + '/evidence/lk-before.png')).status, 404);
  assert.equal((await post(base, app, '/api/runs', { caseId: 'portrait', gridStep: 2, includeArtwork: false })).status, 400);
  assert.equal((await post(base, app, '/api/requests', { caseId: 'portrait' })).status, 400);
  const html = renderProfileRack(state, { online: true, busy: false, grid: 2, artwork: false }) + renderEmptyArchive() + renderDesignAudits([]);
  assert.match(html, /INCOMPLETE/); assert.match(html, /data-action="run" disabled/);
  assert.doesNotMatch(html, /Poker|POKER|АВАТАР|портрет|lk-before|4c9WDZ/);
  assert.doesNotMatch(await (await fetch(base)).text(), /Poker|POKER|4c9WDZ|fSqSK/);
});

test('context API exposes scoped Chess rules and gaps without inferring a product contract from the shared DS', async t => {
  const root = temp(), app = createVerifier({ profileId: 'chess', dataDir: path.join(root, 'data'), importRoot: path.join(root, 'incoming') });
  const base = await app.listen(0); t.after(() => app.close());
  const response = await fetch(base + '/api/context'); assert.equal(response.status, 200);
  const context = await response.json();
  assert.equal(context.profile.id, 'chess'); assert.equal(context.profile.productContract.kind, 'google-docs');
  assert.equal(context.profile.productContract.documentId, '13PcZ5cpqjyRrojoIIVhKse6igOlLrGs6IpZnLpEHK-Q');
  assert.equal(context.preflight.status, 'INCOMPLETE');
  assert.ok(context.preflight.gaps.some(gap => gap.field === 'productContract' && gap.type === 'PRODUCT_GAP'));
  assert.ok(context.activeRules.length > 0); assert.ok(context.activeRules.every(rule => rule.status === 'canonical'));
  assert.ok(context.candidatesRequiringDecision.every(rule => rule.status === 'candidate'));
  const file = context.activeRules[0].provenance[0];
  const evidence = await fetch(base + '/api/context/evidence?path=' + encodeURIComponent(file));
  assert.equal(evidence.status, 200); assert.match(evidence.headers.get('content-type'), /^text\/plain/);
  assert.equal((await fetch(base + '/api/context/evidence?path=package.json')).status, 403);
  assert.equal((await fetch(base + '/api/context/evidence?path=../package.json')).status, 403);
  const rendered = renderKnowledge(context);
  assert.match(rendered, /Общая дизайн-система/); assert.match(rendered, /Продуктовый контракт игры/);
  assert.match(rendered, /КАНДИДАТ/); assert.match(rendered, /CORE-SOURCE-01/);
  assert.ok(rendered.includes(encodeURIComponent(file)));
  const bad = structuredClone(context); bad.profile.name = '<img onerror="attack">'; bad.activeRules[0].decision = '<script>attack</script>';
  const escaped = renderKnowledge(bad); assert.doesNotMatch(escaped, /<script>|<img onerror/); assert.match(escaped, /&lt;script&gt;/);
});

test('imports preserve FAIL, bytes and parent revision across restart and isolate profiles', async t => {
  const root = temp(), dataDir = path.join(root, 'data'), importRoot = path.join(root, 'incoming'), input = fixture(importRoot);
  let app = createVerifier({ profileId: 'chess', dataDir, importRoot }), base = await app.listen(0);
  t.after(() => app.close());
  const response = await post(base, app, '/api/audits', input); assert.equal(response.status, 201);
  const saved = await response.json(); assert.equal(saved.status, 'FAIL'); assert.equal(saved.profileId, 'chess');
  const manifestBytes = fs.readFileSync(path.join(dataDir, saved.manifestPath || `audits/${saved.id}/manifest.json`));
  assert.equal(hash(manifestBytes), saved.manifestHash);
  const manifest = JSON.parse(manifestBytes);
  const proof = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../check-design-audit.mjs', import.meta.url)), saved.id], {
    env: { ...process.env, VERIFIER_PROFILE: 'chess', VERIFIER_URL: base }
  });
  assert.equal(JSON.parse(proof.stdout).storageVerification, 'PASS');
  assert.equal(JSON.parse(proof.stdout).designAuditStatus, 'FAIL');
  const downloaded = await fetch(base + `/api/audits/${saved.id}/artifacts/report`);
  assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())), manifest.artifacts[0].sha256);
  assert.equal(downloaded.headers.get('x-evidence-sha256'), manifest.artifacts[0].sha256);
  const revision = structuredClone(input); revision.kind = 'revision'; revision.parentAuditId = saved.id;
  revision.checks[0].status = 'INCOMPLETE';
  assert.equal((await post(base, app, '/api/audits', revision)).status, 201);
  assert.deepEqual(fs.readFileSync(path.join(dataDir, `audits/${saved.id}/manifest.json`)), manifestBytes);
  const other = createVerifier({ profileId: 'chess', dataDir: path.join(root, 'other'), importRoot });
  const otherBase = await other.listen(0);
  try { assert.equal((await post(otherBase, other, '/api/audits', revision)).status, 400); } finally { await other.close(); }
  const wrongProfile = { ...input, profileId: 'poker' };
  assert.equal((await post(base, app, '/api/audits', wrongProfile)).status, 400);
  assert.equal((await post(base, app, '/api/audits', { ...revision, parentAuditId: 'audit-from-other-profile' })).status, 400);
  await app.close(); app = createVerifier({ profileId: 'chess', dataDir, importRoot }); base = await app.listen(0);
  assert.deepEqual(await (await fetch(base + `/api/audits/${saved.id}`)).json(), manifest);
  assert.equal((await (await fetch(base + '/api/state')).json()).audits.length, 2);
  assert.throws(() => createVerifier({ profileId: 'poker', dataDir, importRoot }), /другому профилю/);
});

test('new imports reject traversal, unlinked sources, and directory junction escapes before saving', t => {
  const root = temp(), incoming = path.join(root, 'incoming'), input = fixture(incoming), dataDir = path.join(root, 'data');
  const options = { repo: root, dataDir, evidenceRoot: incoming, profileId: 'chess', auditId: 'new-audit', importedAt: new Date().toISOString() };
  for (const corrupt of [
    x => x.artifacts[0].path = '../outside.json',
    x => x.artifacts[0].path = path.join(root, 'outside.json'),
    x => x.screens[0].sourceIds = [],
    x => x.screens[0].sourceIds = ['missing'],
    x => x.sources[0].targetIds = ['unknown'],
    x => x.sources.push({ id: '1:3', name: 'Unlinked', targetIds: ['2:2'] }),
  ]) { const bad = structuredClone(input); corrupt(bad); assert.throws(() => saveDesignAudit(bad, options)); }
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'report.json'), '{}');
  fs.symlinkSync(outside, path.join(incoming, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const escaped = structuredClone(input); escaped.artifacts[0].path = 'escape/report.json';
  assert.throws(() => saveDesignAudit(escaped, options), /Недопустимый файл/);
  assert.equal(fs.existsSync(dataDir), false);
});

test('portable Poker profile executes the real Python engine on copied snapshots without changing input dates or hashes', async t => {
  const root = temp(), dataDir = path.join(root, 'data');
  const app = createVerifier({ profileId: 'poker', dataDir, importRoot: path.join(root, 'incoming') });
  const base = await app.listen(0); t.after(() => app.close());
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.profileId, 'poker'); assert.equal(state.legacyPokerArchive, true);
  assert.equal(state.viewportReview.result.status, 'INCOMPLETE');
  const response = await post(base, app, '/api/runs', { caseId: 'portrait', gridStep: 2, includeArtwork: false });
  assert.equal(response.status, 202); const started = await response.json();
  const deadline = Date.now() + 10000;
  let run;
  do {
    await new Promise(resolve => setTimeout(resolve, 50));
    run = (await (await fetch(base + '/api/state')).json()).runs.find(r => r.id === started.id);
  } while (run.status === 'RUNNING' && Date.now() < deadline);
  assert.equal(run.status, 'FAIL'); assert.equal(run.fidelityStatus, 'PASS_WITH_ROUNDING');
  assert.equal(run.pixelStatus, 'FAIL'); assert.equal(run.execution, 'local-python');
  assert.equal(run.capturedAt, state.cases[0].capturedAt);
  assert.equal(hash(fs.readFileSync(path.join(dataDir, 'runs', run.id, 'source.json'))), run.sourceHash);
  const report = await (await fetch(base + `/api/runs/${run.id}/report`)).json();
  assert.equal(report.matchedNodes, 9); assert.equal(report.overallStatus, 'FAIL');
});
