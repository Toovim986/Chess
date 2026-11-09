import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { saveDesignAudit } from '../audit-store.mjs';
import { renderDesignAudits, renderAuditOverview } from '../public/design-audits.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-concept-'));
  const incoming = path.join(root, 'incoming'); fs.mkdirSync(incoming);
  fs.writeFileSync(path.join(incoming, 'board.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII=', 'base64'));
  fs.writeFileSync(path.join(incoming, 'report.json'), '{}');
  const input = { schema: 'verifier-design-audit/1', kind: 'concept', title: 'Chess concepts', summary: 'Discussion only', capturedAt: '2026-10-27T09:00:00Z',
    source: { kind: 'google-docs', documentId: 'gdd-chess', revision: 'revision-1' }, target: { kind: 'image-concept' },
    coverage: { expectedSourceFrames: 1, expectedTargetFrames: 1 },
    sources: [{ id: 'gdd', name: 'Chess GDD', targetIds: ['board-01'] }],
    screens: [{ id: 'board-01', name: 'Game and profile', width: 1, height: 1, sourceIds: ['gdd'], screenshotArtifact: 'board' }],
    checks: [{ id: 'ds', name: 'DS', status: 'INCOMPLETE', summary: 'Visual interpretation', artifactIds: ['report'] }],
    artifacts: [{ id: 'board', label: 'Board', path: 'board.png', role: 'concept' }, { id: 'report', label: 'Report', path: 'report.json', role: 'report' }] };
  return { root, input, options: { repo: root, evidenceRoot: incoming, dataDir: path.join(root, 'data'), profileId: 'chess', auditId: 'audit-concept', importedAt: '2026-10-27T10:00:00Z' } };
}

test('PNG concepts persist typed GDD provenance, INCOMPLETE and exact artifact bytes', () => {
  const { input, options } = fixture(); const summary = saveDesignAudit(input, options);
  const bytes = fs.readFileSync(path.join(options.dataDir, summary.manifestPath)); const manifest = JSON.parse(bytes);
  assert.equal(summary.kind, 'concept'); assert.equal(summary.status, 'INCOMPLETE');
  assert.equal(manifest.origin, 'imported-image-concept'); assert.deepEqual(manifest.source, input.source); assert.deepEqual(manifest.target, input.target);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), summary.manifestHash);
  for (const artifact of manifest.artifacts) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(options.dataDir, 'audits', summary.id, artifact.filename))).digest('hex'), artifact.sha256);
  const html = renderDesignAudits([summary], manifest, summary.id) + renderAuditOverview([summary]);
  assert.match(html, /Концепты для обсуждения/); assert.match(html, /docs.google.com\/document\/d\/gdd-chess/);
  assert.match(html, /Изображения мобильных концептов/); assert.match(html, /INCOMPLETE/); assert.match(html, /artifacts\/board/);
  assert.doesNotMatch(html, /figma\.com|undefined/);
});

test('concept imports reject missing provenance and fabricated Figma destinations before saving', () => {
  for (const corrupt of [x => delete x.source.revision, x => x.source.kind = 'figma', x => x.target.kind = 'figma', x => x.target.fileKey = 'fake-file', x => x.source.pageId = '1:1']) {
    const { input, options } = fixture(); corrupt(input); assert.throws(() => saveDesignAudit(input, options)); assert.equal(fs.existsSync(options.dataDir), false);
  }
});

test('Figma revisions retain required file/page provenance and real Figma links', () => {
  const { input, options } = fixture(); input.kind = 'revision';
  assert.throws(() => saveDesignAudit(input, options));
  input.source = { fileKey: 'library', pageId: '1:1' }; input.target = { fileKey: 'game', pageId: '2:1' };
  const summary = saveDesignAudit(input, options); const manifest = JSON.parse(fs.readFileSync(path.join(options.dataDir, summary.manifestPath)));
  assert.equal(manifest.origin, 'imported-design-audit');
  assert.match(renderDesignAudits([summary], manifest, summary.id), /figma.com\/design\/game/);
});

test('successful storage alone cannot certify a PNG concept as design PASS; FAIL stays FAIL', () => {
  for (const [submitted, expected] of [['PASS', 'INCOMPLETE'], ['PASS_WITH_ROUNDING', 'INCOMPLETE'], ['FAIL', 'FAIL']]) {
    const { input, options } = fixture(); input.checks[0].status = submitted;
    const saved = saveDesignAudit(input, options); assert.equal(saved.status, expected);
    const manifest = JSON.parse(fs.readFileSync(path.join(options.dataDir, saved.manifestPath)));
    assert.equal(manifest.status, expected); assert.equal(manifest.checks[0].status, submitted);
  }
});
