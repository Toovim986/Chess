import fs from 'node:fs';
import path from 'node:path';
import { root, loadProject, preflight, context, search } from './knowledge.mjs';

const [command = 'help', id = 'chess', ...args] = process.argv.slice(2);
try {
  if (command === 'serve') {
    loadProject(id);
    process.env.VERIFIER_PROFILE = id;
    const { createVerifier } = await import('./verifier/server.mjs');
    const app = createVerifier();
    const url = await app.listen(Number(process.env.VERIFIER_PORT || (id === 'poker' ? 43131 : 43130)));
    console.log(`Верификатор · ${id}: ${url}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
  } else {
    let result;
    if (command === 'context') result = context(id);
    else if (command === 'preflight') { result = preflight(loadProject(id)); process.exitCode = result.gaps.length ? 2 : 0; }
    else if (command === 'search') result = search(id, args.join(' '));
    else if (command === 'history') {
      loadProject(id);
      const statePath = path.join(root, 'profiles', id, 'data', 'state.json');
      const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
      result = { profileId: id, scope: 'Сохранённая история. Статусы не пересчитывались.',
        audits: (state.audits || []).map(({id, title, status, capturedAt, screenCount, artifactCount, manifestHash}) => ({id, title, status, capturedAt, screenCount, artifactCount, manifestHash})),
        notes: state.notes || [], runs: (state.runs || []).map(({id, status, capturedAt, scope}) => ({id, status, capturedAt, scope})) };
    } else if (command === 'help') result = { commands: ['context <profile>', 'preflight <profile>', 'search <profile> <слова>', 'history <profile>', 'serve <profile>'],
      profiles: ['chess', 'poker'], note: 'preflight: exit 2 = INCOMPLETE; exit 0 = локальные источники готовы к содержательному ревью, не PASS дизайна.' };
    else throw new Error('Неизвестная команда; node cli.mjs help');
    console.log(JSON.stringify(result, null, 2));
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
