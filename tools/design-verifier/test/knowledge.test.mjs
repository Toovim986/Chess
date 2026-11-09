import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { root, loadProject, preflight, context, search } from '../knowledge.mjs';

test('Chess cannot inherit Poker sources or claim DS/runtime readiness', () => {
  const c = context('chess');
  assert.equal(c.preflight.status, 'INCOMPLETE');
  assert.equal(c.profile.designSystem.fileKey, 'XSrnXoAtfXrNMIH1mFPjGc');
  assert.equal(c.profile.productContract.kind, 'google-docs');
  assert.equal(c.profile.productContract.documentId, '13PcZ5cpqjyRrojoIIVhKse6igOlLrGs6IpZnLpEHK-Q');
  assert.equal(c.profile.productContract.completeness, 'partial');
  assert.ok(c.preflight.gaps.some(g => g.field === 'productContract' && g.type === 'PRODUCT_GAP' && g.decision.includes('Источник подключён')));
  assert.equal(c.preflight.designSystemCompliance, 'INCOMPLETE');
  assert.equal(c.preflight.runtime, 'INCOMPLETE');
  assert.equal(c.preflight.gaps.length, 4);
  assert.equal(c.activeRules.length, 7);
  assert.ok(c.activeRules.every(r => r.scope === 'workflow'));
  assert.ok(c.candidatesRequiringDecision.every(r => !c.profile.ruleIds.includes(r.id)));
  assert.ok(search('chess', 'перекры').some(l => l.id === 'LESSON-OVERLAP-01'));
  assert.throws(() => loadProject('../poker'));
});

test('Configuration readiness requires matching, profile-confined evidence and never grants design PASS', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-knowledge-'));
  t.after(() => fs.rmSync(temp, {recursive:true, force:true}));
  fs.mkdirSync(path.join(temp, 'profiles/chess'), {recursive:true});
  fs.mkdirSync(path.join(temp, 'knowledge'));
  fs.copyFileSync(path.join(root,'knowledge/rules.json'), path.join(temp,'knowledge/rules.json'));
  const bytes = Buffer.from('Synthetic test fixture; not production approval.');
  fs.writeFileSync(path.join(temp,'profiles/chess/evidence.txt'), bytes);
  const s = {fileKey:'test',nodeId:'1:2',revision:'test',reviewedBy:'test',verifiedAt:'2026-01-01T00:00:00Z',evidencePath:'evidence.txt',sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  const project = {...loadProject('chess'), designSystem:s, productContract:s, compositionContract:s,
    destination:{fileKey:'test',pageId:'1:3'},viewportPolicy:{version:'test',sizes:[{width:360,height:640}]}};
  const result = preflight(project,temp);
  assert.equal(result.status,'READY_FOR_REVIEW');
  assert.equal(result.designSystemCompliance,'INCOMPLETE');
  const doc = {...s,kind:'google-docs',documentId:'13PcZ5cpqjyRrojoIIVhKse6igOlLrGs6IpZnLpEHK-Q'};
  delete doc.fileKey; delete doc.nodeId;
  assert.equal(preflight({...project,productContract:doc},temp).status,'READY_FOR_REVIEW');
  const partial = preflight({...project,productContract:{...doc,completeness:'partial',openDecisions:['Balance is unresolved']}},temp);
  assert.equal(partial.status,'INCOMPLETE');
  assert.ok(partial.gaps.some(g=>g.field==='productContract' && g.decision.includes('Balance is unresolved')));
  assert.equal(preflight({...project,productContract:{...doc,documentId:'https://wrong.example'}},temp).status,'INCOMPLETE');
  assert.equal(preflight({...project,productContract:{...doc,kind:'unsupported'}},temp).status,'INCOMPLETE');
  fs.writeFileSync(path.join(temp,'profiles/chess/evidence.txt'),'changed');
  assert.equal(preflight(project,temp).status,'INCOMPLETE');
  fs.writeFileSync(path.join(temp,'outside.txt'),bytes);
  assert.equal(preflight({...project,designSystem:{...s,evidencePath:'../../outside.txt'}},temp).status,'INCOMPLETE');
  assert.equal(preflight({...project,designSystem:{...s,revision:'   '}},temp).status,'INCOMPLETE');
  assert.equal(preflight({...project,designSystem:{...s,reviewedBy:{name:'test'}}},temp).status,'INCOMPLETE');
});
