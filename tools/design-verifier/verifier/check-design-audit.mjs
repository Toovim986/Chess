import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadProfile } from './profile.mjs';
const profile = loadProfile();
const auditId = process.argv[2];
if (!auditId || !/^[a-zA-Z0-9_-]+$/.test(auditId)) throw new Error('Usage: node verifier/check-design-audit.mjs AUDIT_ID');
const base = process.env.VERIFIER_URL || `http://127.0.0.1:${process.env.VERIFIER_PORT || profile.config.port}`;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const stateResponse = await fetch(base + '/api/state'); assert.equal(stateResponse.status, 200);
const state = await stateResponse.json(); assert.equal(state.profileId, profile.profileId, 'Wrong active profile');
const summary = state.audits.find(a => a.id === auditId); assert.ok(summary, 'Audit is present in profile state');
const response = await fetch(`${base}/api/audits/${auditId}/report`); assert.equal(response.status, 200);
const manifestBytes = Buffer.from(await response.arrayBuffer());
assert.equal(hash(manifestBytes), summary.manifestHash); assert.equal(response.headers.get('x-evidence-sha256'), summary.manifestHash);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
let bytesChecked = manifestBytes.length;
for (const artifact of manifest.artifacts) {
  const download = await fetch(`${base}/api/audits/${auditId}/artifacts/${encodeURIComponent(artifact.id)}`);
  assert.equal(download.status, 200);
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.length, artifact.bytes); assert.equal(hash(bytes), artifact.sha256);
  assert.equal(download.headers.get('x-evidence-sha256'), artifact.sha256); bytesChecked += bytes.length;
}
console.log(JSON.stringify({ profileId: profile.profileId, auditId, storageVerification: 'PASS', designAuditStatus: manifest.status,
  manifestHash: summary.manifestHash, artifactCount: manifest.artifacts.length, bytesChecked,
  scope: 'Stored manifest and artifact byte integrity only. Does not execute design checks or certify rendered screenshots.' }, null, 2));
