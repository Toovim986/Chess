import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getViewportReview } from './viewport.mjs';
import { saveDesignAudit } from './audit-store.mjs';
import { loadProfile, packageRoot, unavailableViewport } from './profile.mjs';
import { context as projectContext } from '../knowledge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = packageRoot;
const publicRoot = path.join(here, 'public');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const figmaLink = (file, node) => `https://www.figma.com/design/${file}/?node-id=${encodeURIComponent(node)}`;
const id = prefix => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function contextEvidencePaths(context) {
  const files = new Set();
  for (const rule of [...context.activeRules, ...context.candidatesRequiringDecision]) {
    for (const file of rule.provenance || []) files.add(file);
  }
  for (const lesson of context.lessons) if (lesson.evidence) files.add(lesson.evidence);
  for (const field of ['designSystem', 'productContract', 'compositionContract']) {
    const file = context.profile[field]?.evidencePath;
    if (typeof file === 'string') files.add(path.posix.join('profiles', context.profile.id, file.replaceAll('\\', '/')));
  }
  return files;
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}
function safeFile(root, relative) {
  const base = fs.realpathSync(root);
  const requested = path.resolve(base, relative);
  if (!requested.startsWith(base + path.sep)) fail('Недопустимый путь', 403);
  if (!fs.existsSync(requested) || !fs.statSync(requested).isFile()) fail('Файл не найден', 404);
  const actual = fs.realpathSync(requested);
  if (!actual.startsWith(base + path.sep)) fail('Недопустимый путь', 403);
  return actual;
}
async function body(request, limit = 8 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) fail('Слишком большой запрос', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('Нужен корректный JSON'); }
}

export function createVerifier({ profileId = process.env.VERIFIER_PROFILE || 'chess', dataDir: customDataDir, importRoot: customImportRoot, viewportReviewProvider } = {}) {
  const profile = loadProfile(profileId);
  const { config, engineRoot, evidenceRoot, profileRoot } = profile;
  const dataDir = customDataDir || process.env.VERIFIER_DATA_DIR || profile.dataDir;
  const importRoot = customImportRoot || profile.importRoot;
  fs.mkdirSync(importRoot, { recursive: true });
  viewportReviewProvider ||= () => config.viewport ? getViewportReview({ inputPath: path.join(profileRoot, config.viewport.input), policyPath: path.join(profileRoot, config.viewport.policy) }) : unavailableViewport();
  fs.mkdirSync(dataDir, { recursive: true });
  const statePath = path.join(dataDir, 'state.json');
  const token = crypto.randomBytes(24).toString('hex');
  const startedAt = new Date().toISOString();
  const state = fs.existsSync(statePath) ? readJson(statePath) : { version: 1, runs: [], notes: [], requests: [], events: [], captures: {} };
  if (state.profileId && state.profileId !== profileId) throw new Error('Хранилище принадлежит другому профилю');
  if (!state.profileId && profileId !== 'poker' && (state.runs.length || state.audits?.length || state.notes.length || state.requests.length)) throw new Error('Хранилище без профиля можно подключить только как архив Poker');
  state.profileId = profileId;
  state.audits ||= [];
  const children = new Set();
  let port;
  const save = () => writeJson(statePath, state);
  function event(title, detail = '', kind = 'info') {
    state.events.unshift({ id: id('event'), at: new Date().toISOString(), title, detail, kind });
  }
  for (const run of state.runs) if (run.status === 'RUNNING') {
    run.status = 'INTERRUPTED'; run.finishedAt = new Date().toISOString();
    run.error = 'Сервис был остановлен до завершения проверки';
  }
  event('Сервис запущен', 'Движок Верификатора подключён. Новая проверка запускается отдельно.'); save();
  const boards = config.boards.map(board => {
    const report = readJson(path.join(evidenceRoot, board.report));
    return { ...board, report, capturedAt: config.evidenceDate,
      sourceUrl: figmaLink(config.targetFile, board.source), targetUrl: figmaLink(config.targetFile, board.target) };
  });
  const avatar = config.legacyPokerArchive ? readJson(path.join(evidenceRoot, 'avatar-result.json')) : { checks: [], checked: 0, failed: 0 };
  const pairs = config.legacyPokerArchive ? readJson(path.join(evidenceRoot, 'avatar-pairs-current.json')) : [];
  const avatarFindings = avatar.checks.filter(c => c.differences).map(c => {
    const pair = pairs.find(p => p.target === c.target);
    const cat = Math.abs(c.maxDelta - 2.2505906355) < .01;
    return { ...c, id: `avatar:${c.target}`, board: 'lk', severity: 'error', rule: 'SOURCE_GEOMETRY',
      title: cat ? 'Изображение кота увеличено' : 'Значки редкости уменьшены',
      detail: cat ? 'Размер изображения отличается от пересчитанного исходника.' : 'Размеры ромбов и промежутки в группе отличаются от исходника.',
      source: pair?.source, screen: pair?.targetScreen, capturedAt: config.evidenceDate,
      sourceUrl: figmaLink(config.sourceFile, pair?.source), targetUrl: figmaLink(config.targetFile, c.target),
      status: 'OPEN' };
  });
  function captureFor(testCase) {
    const current = state.captures[testCase.id];
    if (current) return { ...current, sourcePath: safeFile(dataDir, current.sourcePath), targetPath: safeFile(dataDir, current.targetPath) };
    const sourcePath = path.join(evidenceRoot, testCase.source), targetPath = path.join(evidenceRoot, testCase.target);
    return { sourcePath, targetPath, capturedAt: testCase.evidenceDate, origin: 'archive',
      sourceHash: hash(fs.readFileSync(sourcePath)), targetHash: hash(fs.readFileSync(targetPath)) };
  }
  async function publicState() {
    const active = state.runs.find(r => r.status === 'RUNNING');
    let viewportReview;
    try {
      // Evaluate saved evidence on every GET; this is separate from source/grid runs.
      viewportReview = await viewportReviewProvider();
      if (!viewportReview?.result || !Array.isArray(viewportReview.result.findings)) throw new Error('Incomplete viewport review');
    } catch {
      viewportReview = { policy: null, result: { status: 'INCOMPLETE', checkedScreens: 0, coverage: [],
        findings: [{ code: 'VIEWPORT_REVIEW_UNAVAILABLE', severity: 'incomplete', title: 'Проверка viewport недоступна',
          detail: 'Не удалось прочитать локальные данные правила. Проверки исходника и пиксельной сетки доступны отдельно.' }],
        capturedAt: null, evidenceKind: 'unavailable', inputHash: null, ruleVersion: null } };
    }
    return { project: config.project, profileId, sourceFile: config.sourceFile, targetFile: config.targetFile, legacyPokerArchive: !!config.legacyPokerArchive, server: { startedAt, now: new Date().toISOString(), activeRun: active?.id || null },
      viewportReview,
      csrf: token, boards, avatar: { checked: avatar.checked, failed: avatar.failed, capturedAt: config.evidenceDate },
      findings: avatarFindings, cases: config.cases.map(c => {
        const capture = captureFor(c);
        return { ...c, capturedAt: capture.capturedAt, origin: capture.origin,
          sourceHash: capture.sourceHash, targetHash: capture.targetHash,
          sourceUrl: figmaLink(config.sourceFile, c.sourceRoot), targetUrl: figmaLink(config.targetFile, c.targetRoot) };
      }), runs: state.runs.map(({ resultPath, ...run }) => ({ ...run, execution: 'local-python' })), notes: state.notes, requests: state.requests,
      audits: state.audits.map(({ manifestPath, ...audit }) => ({ ...audit, execution: 'imported-report' })),
      events: state.events.slice(0, 100), designReference: config.designReference,
      figmaConnection: { mode: 'assistant', label: 'Снимки через ассистента', automaticWrites: false } };
  }
  function launchRun(input) {
    const testCase = config.cases.find(c => c.id === input.caseId);
    if (!testCase) fail('Неизвестная проверка');
    if (![2, 4, 8].includes(input.gridStep)) fail('Шаг сетки: 2, 4 или 8');
    if (typeof input.includeArtwork !== 'boolean') fail('Параметр графики должен быть логическим');
    if (state.runs.some(r => r.status === 'RUNNING')) fail('Проверка уже выполняется', 409);
    const capture = captureFor(testCase);
    const run = { id: id('run'), caseId: testCase.id, name: testCase.name, board: testCase.board,
      status: 'RUNNING', startedAt: new Date().toISOString(), capturedAt: capture.capturedAt,
      captureOrigin: capture.origin, sourceHash: capture.sourceHash, targetHash: capture.targetHash,
      gridStep: input.gridStep, includeArtwork: input.includeArtwork, scope: testCase.description };
    const runDir = path.join(dataDir, 'runs', run.id);
    fs.mkdirSync(runDir, { recursive: true });
    // Each run owns immutable copies of its inputs. A later import cannot race this process.
    fs.copyFileSync(capture.sourcePath, path.join(runDir, 'source.json'));
    fs.copyFileSync(capture.targetPath, path.join(runDir, 'target.json'));
    state.runs.unshift(run); event('Проверка началась', `${run.name} · сетка ${run.gridStep} px`, 'run'); save();
    const args = ['-B', path.join(engineRoot, 'compare.py'), path.join(runDir, 'source.json'), path.join(runDir, 'target.json'),
      '--source-node', testCase.sourceRoot, '--target-node', testCase.targetRoot, '--grid-step', String(run.gridStep)];
    if (testCase.figmaRounding === true) args.push('--figma-rounding');
    if (run.includeArtwork) args.push('--include-artwork');
    const child = spawn(process.env.VERIFIER_PYTHON || 'python', args, { shell: false, windowsHide: true, cwd: repo });
    children.add(child);
    let output = '', errors = '', ended = false;
    const finish = (code, error) => {
      if (ended) return; ended = true; clearTimeout(timeout); children.delete(child);
      run.finishedAt = new Date().toISOString(); run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
      try {
        if (error) throw error;
        const result = JSON.parse(output);
        if (!['PASS', 'PASS_WITH_ROUNDING', 'FAIL', 'WARN', 'INCOMPLETE'].includes(result.overallStatus)) throw new Error('Движок вернул неполный отчёт');
        if (![0, 1, 2].includes(code)) throw new Error('Движок завершился с ошибкой');
        run.status = result.overallStatus; run.fidelityStatus = result.status;
        run.pixelStatus = result.pixelGrid.status; run.matchedNodes = result.matchedNodes;
        run.errorCount = result.findings.length + result.pixelGrid.errors;
        run.warningCount = result.pixelGrid.warnings;
        run.coverageComplete = result.coverageComplete && result.pixelGrid.coverageComplete;
        run.findings = [...result.findings.map((f, i) => ({ ...f, id: `${run.id}:source:${i}`, severity: 'error', check: 'source', title: 'Отличие от исходника' })),
          ...result.pixelGrid.findings.map((f, i) => ({ ...f, id: `${run.id}:grid:${i}`, check: 'grid', title: f.code === 'FRACTIONAL_PIXEL' ? 'Дробное значение' : 'Значение вне сетки' }))];
        run.missing = result.pixelGrid.missing; run.roundingCount = result.rounding.length;
        run.resultPath = path.join('runs', run.id, 'result.json'); writeJson(path.join(dataDir, run.resultPath), result);
        event('Проверка завершена', `${run.name} · ${run.status} · ${run.errorCount} расхождений`, run.status === 'FAIL' ? 'error' : 'run');
      } catch (e) {
        run.status = 'ERROR'; run.error = e.message; run.diagnostic = errors.slice(0, 2000);
        event('Ошибка запуска', e.message, 'error');
      }
      save();
    };
    const timeout = setTimeout(() => { child.kill(); finish(null, new Error('Проверка превысила 60 секунд')); }, 60000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 8 * 1024 * 1024) { child.kill(); finish(null, new Error('Слишком большой отчёт')); } });
    child.stderr.on('data', chunk => { if (errors.length < 8000) errors += chunk; });
    child.on('error', e => finish(null, e)); child.on('close', code => finish(code));
    return run;
  }
  function importCapture(input) {
    const testCase = config.cases.find(c => c.id === input.caseId);
    if (!testCase) fail('Неизвестная проверка');
    if (!input.capturedAt || !Number.isFinite(Date.parse(input.capturedAt)) || Date.parse(input.capturedAt) > Date.now() + 60000) fail('Некорректная дата снимка');
    for (const [key, expectedFile, expectedRoot] of [['source', config.sourceFile, testCase.sourceRoot], ['target', config.targetFile, testCase.targetRoot]]) {
      const snapshot = input[key];
      if (!snapshot || snapshot.coverage !== 'complete' || snapshot.fileKey !== expectedFile || !snapshot.roots?.includes(expectedRoot) || !Array.isArray(snapshot.nodes)) fail(`Неполный или чужой снимок: ${key}`);
      if (snapshot.nodes.some(n => !n || typeof n.id !== 'string')) fail(`Некорректный узел: ${key}`);
      const ids = new Set(snapshot.nodes.map(n => n.id));
      if (!ids.has(expectedRoot) || ids.size !== snapshot.nodes.length || snapshot.nodes.some(n => !n.geometry || !['x','y','width','height'].every(p => typeof n.geometry[p] === 'number' && Number.isFinite(n.geometry[p])) || !Array.isArray(n.children) || n.children.some(c => !ids.has(c)))) fail(`Неполное дерево: ${key}`);
      // Reject cycles and shared children before the recursive comparison engine sees them.
      const index = new Map(snapshot.nodes.map(n => [n.id, n])), seen = new Set();
      const stack = [...snapshot.roots];
      while (stack.length) {
        const next = stack.pop();
        if (seen.has(next) || !index.has(next)) fail(`Снимок не является деревом: ${key}`);
        seen.add(next); stack.push(...index.get(next).children);
      }
      if (seen.size !== ids.size) fail(`В снимке есть недоступные узлы: ${key}`);
    }
    const directory = path.join('captures', id(testCase.id));
    const capture = { sourcePath: path.join(directory, 'source.json'), targetPath: path.join(directory, 'target.json'),
      capturedAt: input.capturedAt, importedAt: new Date().toISOString(), origin: 'figma-mcp',
      sourceHash: hash(JSON.stringify(input.source)), targetHash: hash(JSON.stringify(input.target)) };
    writeJson(path.join(dataDir, capture.sourcePath), input.source); writeJson(path.join(dataDir, capture.targetPath), input.target);
    // Hashes represent the actual saved bytes, matching later run provenance.
    capture.sourceHash = hash(fs.readFileSync(path.join(dataDir, capture.sourcePath)));
    capture.targetHash = hash(fs.readFileSync(path.join(dataDir, capture.targetPath)));
    state.captures[testCase.id] = capture;
    for (const request of state.requests) if (request.caseId === testCase.id && request.status === 'WAITING') {
      request.status = 'CAPTURED'; request.completedAt = capture.importedAt;
    }
    event('Снимки Figma обновлены', `${testCase.name} · источник и результат сохранены`, 'capture'); save();
    return capture;
  }
  const server = http.createServer(async (request, response) => {
    const json = (status, data) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(data)); };
    try {
      const host = request.headers.host;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) fail('Недопустимый Host', 403);
      const url = new URL(request.url, `http://${host}`);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
      if (request.method === 'GET' && url.pathname === '/api/state') return json(200, await publicState());
      if (request.method === 'GET' && url.pathname === '/api/context') return json(200, projectContext(profileId));
      if (request.method === 'GET' && url.pathname === '/api/context/evidence') {
        const filePath = url.searchParams.get('path');
        if (!contextEvidencePaths(projectContext(profileId)).has(filePath)) fail('Доказательство отсутствует в контексте профиля', 403);
        const file = safeFile(repo, filePath);
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' });
        return fs.createReadStream(file).pipe(response);
      }
      if (request.method === 'POST') {
        if (request.headers.origin !== `http://${host}` || request.headers['x-verifier-token'] !== token) fail('Недопустимый источник запроса', 403);
        const input = await body(request);
        if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Нужен JSON-объект');
        if (url.pathname === '/api/runs') return json(202, launchRun(input));
        if (url.pathname === '/api/captures') return json(201, importCapture(input));
        if (url.pathname === '/api/audits') {
          if (input.profileId && input.profileId !== profileId) fail('Манифест принадлежит другому профилю');
          if (input.parentAuditId && !state.audits.some(a => a.id === input.parentAuditId)) fail('Предыдущая ревизия не найдена');
          const audit = saveDesignAudit(input, { repo, dataDir, profileId, evidenceRoot: importRoot, auditId: id('audit'), importedAt: new Date().toISOString() });
          state.audits.unshift(audit);
          event('Сохранена ревизия макетов', `${audit.title} · ${audit.screenCount} экранов · ${audit.status}`, 'capture'); save();
          const { manifestPath, ...result } = audit; return json(201, result);
        }
        if (url.pathname === '/api/requests') {
          if (!config.cases.some(c => c.id === input.caseId)) fail('Неизвестная проверка');
          const existing = state.requests.find(r => r.caseId === input.caseId && r.status === 'WAITING');
          if (existing) return json(200, existing);
          const item = { id: id('request'), caseId: input.caseId, status: 'WAITING', createdAt: new Date().toISOString(),
            instruction: 'Обновить оба снимка через Figma MCP, импортировать и запустить проверку. Запрос ожидает ассистента.' };
          state.requests.unshift(item); event('Запрошены свежие снимки', 'Запрос ожидает ассистента; фоновое обновление Figma не запущено.', 'capture'); save(); return json(201, item);
        }
        if (url.pathname === '/api/notes') {
          if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000) fail('Пометка должна содержать от 1 до 4000 символов');
          if (!['note', 'attention', 'decision', 'recheck'].includes(input.kind)) fail('Неизвестный тип пометки');
          if (input.target && typeof input.target !== 'string') fail('Некорректная ссылка');
          const note = { id: id('note'), at: new Date().toISOString(), author: input.author === 'assistant' ? 'Ассистент' : 'Вы',
            kind: input.kind, target: (input.target || 'project').slice(0, 180), text: input.text.trim() };
          state.notes.unshift(note); event('Добавлена пометка', note.text.slice(0, 100), 'note'); save(); return json(201, note);
        }
        fail('Маршрут не найден', 404);
      }
      if (request.method !== 'GET') fail('Метод не поддерживается', 405);
      if (url.pathname.startsWith('/api/audits/')) {
        const parts = url.pathname.split('/'), audit = state.audits.find(a => a.id === parts[3]);
        if (!audit) fail('Ревизия не найдена', 404);
        const manifestFile = safeFile(dataDir, audit.manifestPath), manifest = readJson(manifestFile);
        if (parts.length === 4 || (parts.length === 5 && parts[4] === 'report')) {
          if (parts[4] === 'report') {
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
              'Content-Disposition': `attachment; filename="${audit.id}.json"`, 'X-Evidence-SHA256': audit.manifestHash });
            return fs.createReadStream(manifestFile).pipe(response);
          }
          return json(200, manifest);
        }
        if (parts.length === 6 && parts[4] === 'artifacts') {
          const artifact = manifest.artifacts.find(a => a.id === parts[5]);
          if (!artifact) fail('Доказательство не найдено', 404);
          const file = safeFile(dataDir, path.join('audits', audit.id, artifact.filename));
          const type = path.extname(file) === '.png' ? 'image/png' : path.extname(file) === '.json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';
          response.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'X-Evidence-SHA256': artifact.sha256 });
          return fs.createReadStream(file).pipe(response);
        }
        fail('Маршрут не найден', 404);
      }
      if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/report')) {
        const run = state.runs.find(r => r.id === url.pathname.split('/')[3]);
        if (!run?.resultPath) fail('Отчёт ещё не сформирован', 404);
        response.setHeader('Content-Disposition', `attachment; filename="${run.id}.json"`);
        return json(200, readJson(safeFile(dataDir, run.resultPath)));
      }
      let file;
      if (url.pathname.startsWith('/evidence/')) {
        if (!config.legacyPokerArchive) fail('Архив не подключён', 404);
        file = safeFile(evidenceRoot, decodeURIComponent(url.pathname.slice(10)));
      }
      else if (url.pathname === '/capture-script.js') file = path.join(engineRoot, 'figma-capture.js');
      else file = safeFile(publicRoot, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)));
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
      if (!types[path.extname(file)]) fail('Формат не поддерживается', 403);
      response.writeHead(200, { 'content-type': types[path.extname(file)], 'cache-control': 'no-cache' });
      fs.createReadStream(file).pipe(response);
    } catch (e) { json(e.status || 500, { error: e.status ? e.message : 'Внутренняя ошибка сервиса' }); }
  });
  return { server, state, token, profileId, async listen(value = config.port || 43130) {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(value, '127.0.0.1', resolve); });
    port = server.address().port; return `http://127.0.0.1:${port}`;
  }, async close() { for (const child of children) child.kill(); await new Promise(resolve => server.close(resolve)); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createVerifier();
  const url = await app.listen(process.env.VERIFIER_PORT ? Number(process.env.VERIFIER_PORT) : undefined);
  console.log(`Верификатор: ${url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
