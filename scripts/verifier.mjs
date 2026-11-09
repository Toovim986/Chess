import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../tools/design-verifier/', import.meta.url));
const entry = fileURLToPath(new URL('../tools/design-verifier/cli.mjs', import.meta.url));
const dataDirectory = fileURLToPath(new URL('../data/verifier-chess/', import.meta.url));
const initialData = fileURLToPath(new URL('../tools/design-verifier/profiles/chess/data/', import.meta.url));
const [command = 'context', ...args] = process.argv.slice(2);
const commands = new Set(['context', 'preflight', 'search', 'history', 'serve', 'help']);

if (!commands.has(command)) {
  console.error('Команды: context, preflight, search, history, serve, help. Профиль: chess.');
  process.exitCode = 1;
} else if (!fs.existsSync(entry)) {
  console.error('Рабочая копия Верификатора отсутствует: tools/design-verifier/cli.mjs');
  process.exitCode = 1;
} else if (command === 'history' && fs.existsSync(dataDirectory)) {
  const state = JSON.parse(fs.readFileSync(new URL('../data/verifier-chess/state.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify({ profileId: 'chess', scope: 'Живая история этого проекта; статусы не пересчитывались.',
    audits: (state.audits || []).map(({ id, title, status, capturedAt }) => ({ id, title, status, capturedAt })),
    notes: state.notes || [], runs: state.runs || [],
  }, null, 2));
} else {
  if (command === 'serve' && !fs.existsSync(dataDirectory)) {
    fs.cpSync(initialData, dataDirectory, { recursive: true, force: false, errorOnExist: true });
  }
  const child = spawn(process.execPath, [entry, command, 'chess', ...args], {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, VERIFIER_PROFILE: 'chess', VERIFIER_PORT: '43132', VERIFIER_DATA_DIR: dataDirectory },
  });
  child.once('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once('close', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { if (!child.killed) child.kill(signal); });
  }
}
