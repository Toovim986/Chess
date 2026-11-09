// Agent bridge: import exact Figma snapshots and publish review notes to the live service.
import fs from 'node:fs';
import { loadProfile } from './profile.mjs';
const args = process.argv.slice(2), command = args.shift();
const profile = loadProfile();
const base = process.env.VERIFIER_URL || `http://127.0.0.1:${process.env.VERIFIER_PORT || profile.config.port}`;
const state = await fetch(base + '/api/state').then(r => r.json());
if (state.profileId !== profile.profileId) throw new Error('Сервис обслуживает другой профиль; проверьте VERIFIER_PROFILE и VERIFIER_URL');
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const caseId = () => { const requested = option('--case'); if (!requested || !state.cases.some(c => c.id === requested)) throw new Error('Укажите --case с ID настроенной проверки; пустой профиль не содержит проверок'); return requested; };
let endpoint, data;
if (command === 'requests') { console.log(JSON.stringify(state.requests, null, 2)); process.exit(0); }
if (command === 'import-audit') {
  endpoint = '/api/audits'; data = JSON.parse(fs.readFileSync(option('--manifest'), 'utf8'));
} else if (command === 'import') {
  endpoint = '/api/captures';
  data = { caseId: caseId(), capturedAt: option('--captured-at'),
    source: JSON.parse(fs.readFileSync(option('--source'), 'utf8')), target: JSON.parse(fs.readFileSync(option('--target'), 'utf8')) };
} else if (command === 'note') {
  endpoint = '/api/notes'; data = { kind: option('--kind') || 'note', target: option('--target') || 'project',
    text: fs.readFileSync(option('--body-file'), 'utf8'), author: 'assistant' };
} else if (command === 'run') {
  endpoint = '/api/runs'; data = { caseId: caseId(), gridStep: Number(option('--grid') || 2), includeArtwork: args.includes('--include-artwork') };
} else { throw new Error('Commands: requests | import --source FILE --target FILE --captured-at ISO | import-audit --manifest FILE | note --body-file FILE | run'); }
const response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Verifier-Token': state.csrf, Origin: base }, body: JSON.stringify(data) });
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exit(1);
