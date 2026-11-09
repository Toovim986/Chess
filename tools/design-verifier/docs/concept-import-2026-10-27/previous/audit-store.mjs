import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const text = (value, field, max = 4000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`Некорректное поле: ${field}`);
  return value;
};
const nodeId = value => text(value, 'Figma node ID', 180);
const key = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) invalid('Некорректный идентификатор');
  return value;
};
const statuses = ['PASS', 'PASS_WITH_ROUNDING', 'FAIL', 'WARN', 'INCOMPLETE'];

// A design migration is not a one-to-one geometry tree. Preserve the complete
// submitted audit and its evidence, without presenting it as compare.py output.
export function saveDesignAudit(input, { repo, dataDir, auditId, importedAt, profileId, evidenceRoot: configuredEvidenceRoot }) {
  if (input.schema !== 'verifier-design-audit/1') invalid('Нужна схема verifier-design-audit/1');
  if (!['archive', 'revision'].includes(input.kind)) invalid('Нужен тип archive или revision');
  if (input.parentAuditId !== undefined) key(input.parentAuditId);
  text(input.title, 'title', 200); text(input.summary, 'summary');
  if (!Number.isFinite(Date.parse(input.capturedAt)) || Date.parse(input.capturedAt) > Date.now() + 60000) invalid('Некорректная дата доказательств');
  for (const side of ['source', 'target']) { key(input[side]?.fileKey); nodeId(input[side]?.pageId); }
  if (!Array.isArray(input.artifacts) || !input.artifacts.length || input.artifacts.length > 300) invalid('Нужно от 1 до 300 файлов доказательств');
  const evidenceRoot = fs.realpathSync(configuredEvidenceRoot || path.join(repo, 'docs/mobile'));
  const artifacts = [], ids = new Set(); let total = 0;
  for (const artifact of input.artifacts) {
    key(artifact.id); if (ids.has(artifact.id)) invalid('Повторный ID файла'); ids.add(artifact.id);
    if (artifact.id === 'manifest') invalid('ID manifest зарезервирован');
    text(artifact.label, 'artifact.label', 200); text(artifact.role, 'artifact.role', 80);
    if (typeof artifact.path !== 'string' || path.isAbsolute(artifact.path) || (!configuredEvidenceRoot && !artifact.path.replaceAll('\\', '/').startsWith('docs/mobile/'))) invalid('Нужен относительный путь доказательства');
    const requested = path.resolve(configuredEvidenceRoot ? evidenceRoot : repo, artifact.path);
    if (!requested.startsWith(evidenceRoot + path.sep) || !fs.existsSync(requested)) invalid('Файл доказательства не найден');
    const resolved = fs.realpathSync(requested), stat = fs.statSync(resolved), ext = path.extname(resolved).toLowerCase();
    if (!resolved.startsWith(evidenceRoot + path.sep) || !stat.isFile() || !['.json', '.png', '.txt', '.md'].includes(ext)) invalid('Недопустимый файл доказательства');
    if (stat.size > 32 * 1024 * 1024 || (total += stat.size) > 300 * 1024 * 1024) invalid('Пакет доказательств слишком большой');
    const bytes = fs.readFileSync(resolved);
    if (ext === '.json') { try { JSON.parse(bytes.toString('utf8')); } catch { invalid('Повреждённый JSON доказательства'); } }
    let dimensions;
    if (ext === '.png') {
      if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString() !== 'IHDR') invalid('Повреждённый PNG доказательства');
      dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    artifacts.push({ id: artifact.id, label: artifact.label, role: artifact.role, originalPath: artifact.path,
      filename: `${artifact.id}${ext}`, bytes: stat.size, sha256: sha256(bytes), ...(dimensions && { dimensions }), content: bytes });
  }
  const byId = new Map(artifacts.map(a => [a.id, a]));
  if (!Array.isArray(input.screens) || !input.screens.length || input.screens.length > 1000) invalid('Нужен список экранов');
  const screenIds = new Set(), screens = input.screens.map(s => {
    nodeId(s.id); if (screenIds.has(s.id)) invalid('Повторный ID экрана'); screenIds.add(s.id);
    text(s.name, 'screen.name', 300);
    if (![s.width, s.height].every(v => Number.isFinite(v) && v > 0 && v < 10000)) invalid('Некорректные размеры экрана');
    const screenshot = byId.get(s.screenshotArtifact);
    const exportScale = screenshot?.dimensions ? screenshot.dimensions.width / s.width : NaN;
    if (!Number.isInteger(exportScale) || exportScale < 1 || screenshot.dimensions.height !== s.height * exportScale) invalid('Снимок не соответствует размеру экрана: нужен равномерный целочисленный масштаб экспорта');
    if (!Array.isArray(s.sourceIds)) invalid('Не указаны источники экрана'); s.sourceIds.forEach(nodeId);
    return { id: s.id, name: s.name, width: s.width, height: s.height, sourceIds: s.sourceIds, screenshotArtifact: s.screenshotArtifact, ...(exportScale !== 1 && { exportScale }) };
  });
  if (!Array.isArray(input.sources)) invalid('Нужен список исходников');
  const sourceIds = new Set(), sources = input.sources.map(s => {
    nodeId(s.id); if (sourceIds.has(s.id)) invalid('Повторный исходник'); sourceIds.add(s.id);
    text(s.name, 'source.name', 300);
    if (!Array.isArray(s.targetIds) || !s.targetIds.length || s.targetIds.some(id => !screenIds.has(id))) invalid('Исходник ссылается на неизвестный экран');
    return { id: s.id, name: s.name, targetIds: s.targetIds };
  });
  for (const screen of screens) {
    if (!screen.sourceIds.length || new Set(screen.sourceIds).size !== screen.sourceIds.length || screen.sourceIds.some(id => !sourceIds.has(id))) invalid('Экран должен ссылаться на известные источники');
    for (const sourceId of screen.sourceIds) if (!sources.find(s => s.id === sourceId).targetIds.includes(screen.id)) invalid('Сопоставление источника и экрана должно быть взаимным');
  }
  for (const source of sources) {
    if (new Set(source.targetIds).size !== source.targetIds.length || source.targetIds.some(id => !screens.find(s => s.id === id).sourceIds.includes(source.id))) invalid('Сопоставление экрана и источника должно быть взаимным');
  }
  if (input.coverage?.expectedSourceFrames !== sources.length || input.coverage?.expectedTargetFrames !== screens.length) invalid('Охват не совпадает с полными списками экранов');
  if (!Array.isArray(input.checks) || !input.checks.length) invalid('Нужны результаты отдельных проверок');
  const checkIds = new Set(), checks = input.checks.map(c => {
    key(c.id); if (checkIds.has(c.id)) invalid('Повторный ID проверки'); checkIds.add(c.id);
    text(c.name, 'check.name', 200); text(c.summary, 'check.summary');
    if (!statuses.includes(c.status) || !Array.isArray(c.artifactIds) || !c.artifactIds.length || c.artifactIds.some(id => !byId.has(id))) invalid('Некорректная проверка или её доказательства');
    return { id: c.id, name: c.name, status: c.status, summary: c.summary, artifactIds: c.artifactIds };
  });
  const limitations = input.limitations || [];
  if (!Array.isArray(limitations) || limitations.length > 100) invalid('Некорректные ограничения'); limitations.forEach(v => text(v, 'limitation'));
  const findings = input.findings || [];
  if (!Array.isArray(findings) || findings.length > 10000) invalid('Некорректный список замечаний');
  const findingIds = new Set();
  for (const f of findings) {
    key(f.id); if (findingIds.has(f.id)) invalid('Повторный ID замечания'); findingIds.add(f.id);
    nodeId(f.nodeId); text(f.title, 'finding.title', 300); text(f.detail, 'finding.detail');
    if (!['OPEN', 'FIXED', 'ACCEPTED', 'INCOMPLETE'].includes(f.status) || !['error', 'warning', 'info'].includes(f.severity)) invalid('Некорректный статус замечания');
    if (f.sourceNodeId) nodeId(f.sourceNodeId);
    if (!Array.isArray(f.artifactIds) || f.artifactIds.some(id => !byId.has(id))) invalid('Неизвестные доказательства замечания');
  }
  const status = checks.some(c => c.status === 'FAIL') || findings.some(f => f.status === 'OPEN' && f.severity === 'error') ? 'FAIL' : checks.some(c => c.status === 'INCOMPLETE') || findings.some(f => f.status === 'INCOMPLETE') ? 'INCOMPLETE' : checks.some(c => c.status === 'WARN') || findings.some(f => f.status === 'OPEN' && f.severity === 'warning') ? 'WARN' : checks.some(c => c.status === 'PASS_WITH_ROUNDING') ? 'PASS_WITH_ROUNDING' : 'PASS';
  const manifest = { ...(profileId && { profileId }), schema: input.schema, id: auditId, kind: input.kind, ...(input.parentAuditId && { parentAuditId: input.parentAuditId }), title: input.title, summary: input.summary, capturedAt: input.capturedAt, importedAt,
    origin: 'imported-design-audit', status, source: input.source, target: input.target, coverage: input.coverage, screens, sources, checks, limitations, findings,
    artifacts: artifacts.map(({ content, ...a }) => a) };
  // Validate everything before touching data. Each revision gets a fresh immutable directory.
  const directory = path.join(dataDir, 'audits', auditId); fs.mkdirSync(directory, { recursive: true });
  for (const artifact of artifacts) fs.writeFileSync(path.join(directory, artifact.filename), artifact.content, { flag: 'wx' });
  const manifestBytes = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(path.join(directory, 'manifest.json'), manifestBytes, { flag: 'wx' });
  return { ...(profileId && { profileId }), id: auditId, kind: input.kind, title: input.title, summary: input.summary, capturedAt: input.capturedAt, importedAt, status,
    sourceCount: sources.length, screenCount: screens.length, artifactCount: artifacts.length, checks,
    manifestHash: sha256(manifestBytes), manifestPath: path.join('audits', auditId, 'manifest.json') };
}
