import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Run after exporting both collections: node scripts/import-lab-collections.mjs
// Optional arguments select club and/or arena. --check validates inputs without importing.
const root = fileURLToPath(new URL('../', import.meta.url));
const revision = 'chess-lab-2026-10-28';
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const selected = args.filter(arg => arg !== '--check');
const collections = selected.length ? selected : ['club', 'arena'];
assert.ok(collections.every(name => ['club', 'arena'].includes(name)), 'Коллекции: club, arena; проверка без импорта: --check');
assert.equal(new Set(collections).size, collections.length, 'Коллекция указана дважды');
const base = (process.env.VERIFIER_URL || 'http://127.0.0.1:43132').replace(/\/$/, '');
const profileDir = path.join(root, 'tools/design-verifier/profiles/chess');
const profile = JSON.parse(fs.readFileSync(path.join(profileDir, 'project.json'), 'utf8'));
const defaultParent = 'audit-1793113544095-c990fe';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const statuses = new Set(['PASS', 'PASS_WITH_ROUNDING', 'FAIL', 'WARN', 'INCOMPLETE']);

function localFile(directory, filename) {
  assert.ok(typeof filename === 'string' && !path.isAbsolute(filename), 'Нужен относительный путь PNG');
  const resolvedRoot = fs.realpathSync(directory);
  const resolved = fs.realpathSync(path.resolve(directory, filename));
  assert.ok(resolved.startsWith(resolvedRoot + path.sep) && fs.statSync(resolved).isFile(), `Файл вне коллекции: ${filename}`);
  return resolved;
}

function prepareCollection(name) {
  const directory = path.join(root, 'artifacts/concepts', revision, name);
  const collection = readJson(path.join(directory, 'collection.json'));
  assert.ok(typeof collection.title === 'string' && collection.title.trim(), `${name}: нужно название`);
  assert.ok(typeof collection.summary === 'string' && collection.summary.trim(), `${name}: нужно описание`);
  assert.equal(collection.frames?.length, 13, `${name}: ожидаются 12 сюжетов первой коллекции и поражение`);
  assert.ok(collection.review && typeof collection.review === 'object' && !Array.isArray(collection.review), `${name}: нужен review`);
  const frameIds = new Set();
  const files = new Map();
  const modifiedAt = [];
  const screens = collection.frames.map(frame => {
    assert.ok(typeof frame.id === 'string' && frame.id.length <= 180 && frame.id.trim(), `${name}: некорректный ID экрана`);
    assert.ok(!frameIds.has(frame.id), `${name}: повторный ID экрана ${frame.id}`);
    frameIds.add(frame.id);
    assert.ok(typeof frame.name === 'string' && frame.name.trim(), `${name}: нужно имя экрана`);
    assert.ok([frame.width, frame.height].every(value => Number.isInteger(value) && value > 0 && value < 10000), `${name}: некорректные размеры ${frame.id}`);
    const filename = localFile(directory, frame.file);
    assert.equal(path.extname(filename).toLowerCase(), '.png', `${name}: ожидается PNG`);
    const bytes = fs.readFileSync(filename);
    assert.ok(bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.subarray(12, 16).toString() === 'IHDR', `${name}: повреждённый PNG ${frame.file}`);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    const scale = width / frame.width;
    assert.ok(Number.isInteger(scale) && scale >= 1 && height === frame.height * scale, `${name}: размеры PNG не совпадают с ${frame.id}`);
    const artifactId = `screen-${String(files.size + 1).padStart(2, '0')}`;
    files.set(artifactId, { filename: `${artifactId}.png`, label: frame.name, role: 'concept', bytes });
    modifiedAt.push(fs.statSync(filename).mtimeMs);
    return { id: frame.id, name: frame.name, width: frame.width, height: frame.height, sourceIds: ['gdd-chess'], screenshotArtifact: artifactId };
  });
  const dsAuditBytes = fs.readFileSync(localFile(directory, 'ds-audit.json'));
  JSON.parse(dsAuditBytes.toString('utf8'));
  const review = {
    ...collection.review,
    provenance: {
      designSystem: { fileKey: 'XSrnXoAtfXrNMIH1mFPjGc', nodeId: '391:21239' },
      figmaExport: { fileKey: 'QZNrOb57obLvLAadEMSjV3', pageId: '0:1', nodeIds: collection.frames.map(frame => frame.id) },
      productContract: profile.productContract,
      ...collection.review.provenance,
    },
  };
  files.set('review', { filename: 'review.json', label: 'Область проверки и ограничения', role: 'report', bytes: jsonBytes(review) });
  files.set('ds-audit', { filename: 'ds-audit.json', label: 'Источники и экземпляры Poker lib', role: 'report', bytes: dsAuditBytes });
  const imageIds = screens.map(screen => screen.screenshotArtifact);
  const check = (id, label, status, summary, artifactIds) => {
    const supplied = Array.isArray(review.checks) ? review.checks.find(item => item.id === id) : review.checks?.[id];
    const result = { id, name: label, status: supplied?.status || status, summary: supplied?.summary || supplied?.reason || summary, artifactIds };
    assert.ok(statuses.has(result.status), `${name}: неподдерживаемый статус ${id}`);
    assert.ok(typeof result.summary === 'string' && result.summary.trim(), `${name}: отсутствует результат ${id}`);
    return result;
  };
  const incomingPrefix = `${revision}/${name}`;
  const capturedAt = collection.capturedAt || review.capturedAt || new Date(Math.max(...modifiedAt)).toISOString();
  assert.ok(Number.isFinite(Date.parse(capturedAt)) && Date.parse(capturedAt) <= Date.now() + 60000, `${name}: некорректная дата экспорта`);
  const manifest = {
    schema: 'verifier-design-audit/1', profileId: 'chess', kind: 'concept',
    title: collection.title, summary: collection.summary, capturedAt,
    parentAuditId: collection.parentAuditId || defaultParent,
    source: { kind: 'google-docs', documentId: profile.productContract.documentId, revision: profile.productContract.revision },
    target: { kind: 'image-concept' },
    coverage: { expectedSourceFrames: 1, expectedTargetFrames: screens.length },
    sources: [{ id: 'gdd-chess', name: 'VKChess: идеи меты · ГДД', targetIds: screens.map(screen => screen.id) }],
    screens,
    artifacts: [...files].map(([id, file]) => ({ id, label: file.label, role: file.role, path: `${incomingPrefix}/${file.filename}` })),
    checks: [
      { id: 'storage', name: 'Сохранность файлов', status: 'PASS', summary: 'Локальные PNG и отчёты прочитаны; при завершении импорта повторно скачиваются манифест и все файлы для проверки SHA-256.', artifactIds: [...files.keys()] },
      check('ds', 'Применение дизайн-системы', 'INCOMPLETE', 'Нативные экспорты Figma сопровождаются отчётом экземпляров Poker lib. Полнота связей с токенами и варианты компонентов требуют отдельного подтверждения.', ['ds-audit', 'review']),
      check('composition', 'Композиция', 'WARN', 'Экспериментальная композиция для обсуждения; утверждение варианта не выполнено.', [...imageIds, 'review']),
      check('states', 'Состояния и переходы', 'INCOMPLETE', 'Показаны 13 основных экранов. Полное покрытие загрузки, ошибок и переходов не подтверждено.', ['review']),
      check('visual', 'Визуальное ревью', 'INCOMPLETE', 'Просмотр каждого PNG необходимо подтвердить в отчёте коллекции.', [...imageIds, 'review']),
      check('runtime', 'Работа приложения', 'INCOMPLETE', 'Сдача содержит статические PNG. Игровые действия и размеры в приложении не проверены.', ['review']),
    ],
    limitations: review.limitations || [], findings: review.findings || [],
  };
  return { name, directory, files, manifest, incoming: path.join(profileDir, 'incoming', incomingPrefix) };
}

async function state() {
  const response = await fetch(`${base}/api/state`);
  assert.equal(response.status, 200, 'Не удалось прочитать состояние Верификатора');
  const result = await response.json();
  assert.equal(result.profileId, 'chess', 'Сервис обслуживает другой профиль');
  return result;
}

async function verify(collection, summary, reused) {
  const response = await fetch(`${base}/api/audits/${encodeURIComponent(summary.id)}/report`);
  assert.equal(response.status, 200, 'Не удалось скачать манифест');
  const manifestBytes = Buffer.from(await response.arrayBuffer());
  assert.equal(hash(manifestBytes), summary.manifestHash, 'SHA-256 манифеста не совпадает');
  assert.equal(response.headers.get('x-evidence-sha256'), summary.manifestHash);
  const saved = JSON.parse(manifestBytes.toString('utf8'));
  for (const field of ['kind', 'title', 'summary', 'parentAuditId', 'source', 'target', 'coverage', 'sources', 'checks', 'limitations', 'findings']) {
    assert.deepEqual(saved[field], collection.manifest[field], `Импорт с таким названием содержит другие данные: ${field}`);
  }
  assert.deepEqual(saved.screens.map(({ exportScale, ...screen }) => screen), collection.manifest.screens, 'Импорт содержит другой состав экранов');
  assert.equal(saved.artifacts.length, collection.files.size, 'Не совпадает количество файлов');
  let bytesChecked = manifestBytes.length;
  const artifacts = [];
  for (const artifact of saved.artifacts) {
    const local = collection.files.get(artifact.id);
    assert.ok(local, `Неожиданный сохранённый файл ${artifact.id}`);
    assert.equal(hash(local.bytes), artifact.sha256, `Локальный файл изменён после импорта: ${artifact.id}`);
    const download = await fetch(`${base}/api/audits/${encodeURIComponent(summary.id)}/artifacts/${encodeURIComponent(artifact.id)}`);
    assert.equal(download.status, 200, `Не удалось скачать ${artifact.id}`);
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.equal(hash(bytes), artifact.sha256, `SHA-256 файла не совпадает: ${artifact.id}`);
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(download.headers.get('x-evidence-sha256'), artifact.sha256);
    if (artifact.dimensions) assert.deepEqual({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }, artifact.dimensions);
    bytesChecked += bytes.length;
    artifacts.push({ id: artifact.id, sha256: artifact.sha256, bytes: artifact.bytes });
  }
  const proof = {
    auditId: saved.id, parentAuditId: saved.parentAuditId, title: saved.title, reused,
    storageVerification: 'PASS', designAuditStatus: saved.status, manifestHash: summary.manifestHash,
    screens: saved.screens.length, filesVerified: artifacts.length, bytesChecked, artifacts,
    verifiedAt: new Date().toISOString(), url: `${base}/?audit=${encodeURIComponent(saved.id)}`,
    scope: 'Проверены сохранённый манифест, SHA-256 и размеры всех файлов. Проверки дизайна не исполняются импортёром.',
  };
  fs.writeFileSync(path.join(collection.directory, 'manifest.json'), manifestBytes);
  fs.writeFileSync(path.join(collection.directory, 'verification.json'), jsonBytes(proof));
  return proof;
}

// Validate all selected inputs before creating either collection.
const prepared = collections.map(prepareCollection);
assert.equal(new Set(prepared.map(item => item.manifest.title)).size, prepared.length, 'Названия коллекций должны отличаться');
if (checkOnly) {
  console.log(JSON.stringify(prepared.map(item => ({ collection: item.name, title: item.manifest.title, screens: item.manifest.screens.length, files: item.files.size, inputValidation: 'PASS' })), null, 2));
} else {
  const results = [];
  for (const collection of prepared) {
    const current = await state();
    const existing = current.audits.filter(audit => audit.title === collection.manifest.title);
    assert.ok(existing.length <= 1, 'Найдено несколько импортов с одним названием; выберите уникальное название');
    assert.ok(current.audits.some(audit => audit.id === collection.manifest.parentAuditId), 'Родительская ревизия отсутствует');
    if (existing.length) {
      results.push(await verify(collection, existing[0], true));
      continue;
    }
    fs.mkdirSync(collection.incoming, { recursive: true });
    for (const file of collection.files.values()) {
      const destination = path.join(collection.incoming, file.filename);
      if (!fs.existsSync(destination)) fs.writeFileSync(destination, file.bytes, { flag: 'wx' });
      assert.equal(hash(fs.readFileSync(destination)), hash(file.bytes), `В incoming уже есть другой файл: ${destination}`);
    }
    fs.writeFileSync(path.join(collection.directory, 'review.json'), collection.files.get('review').bytes);
    fs.writeFileSync(path.join(collection.directory, 'import-manifest.json'), jsonBytes(collection.manifest));
    const response = await fetch(`${base}/api/audits`, {
      method: 'POST', headers: { Origin: base, 'X-Verifier-Token': current.csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify(collection.manifest),
    });
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    results.push(await verify(collection, result, false));
  }
  console.log(JSON.stringify(results.map(({ artifacts, ...result }) => result), null, 2));
}
