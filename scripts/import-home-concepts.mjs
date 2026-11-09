import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const revision = 'home-2026-10-27-v2';
const sourceDir = path.join(root, 'artifacts/concepts', revision);
const incoming = path.join(root, 'tools/design-verifier/profiles/chess/incoming', revision);
const base = 'http://127.0.0.1:43132';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const names = ['Главная / выбор режима · A', 'Главная / выбор режима · B'];
const images = ['home-a.png', 'home-b.png'];
const state = await fetch(base + '/api/state').then(response => response.json());
assert.equal(state.profileId, 'chess');
assert.ok(!state.audits.some(audit => audit.title === 'Главная / выбор режима · A и B'), 'Revision already imported');
fs.mkdirSync(incoming, { recursive: false });
for (const file of [...images, 'prompts.json', 'review.json']) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(incoming, file), fs.constants.COPYFILE_EXCL);
  assert.equal(sha(fs.readFileSync(path.join(sourceDir, file))), sha(fs.readFileSync(path.join(incoming, file))));
}
const review = JSON.parse(fs.readFileSync(path.join(sourceDir, 'review.json'), 'utf8'));
const artifacts = [
  ...images.map((file, index) => ({ id: `image-${index + 1}`, label: names[index], role: 'concept', path: `${revision}/${file}` })),
  { id: 'prompts', label: 'Промпты генерации', role: 'report', path: `${revision}/prompts.json` },
  { id: 'review', label: 'Охват и ограничения', role: 'report', path: `${revision}/review.json` },
];
const checks = [
  { id: 'storage', name: 'Сохранность файлов', status: 'PASS', summary: 'Байты локальной поставки проверены; после импорта повторно проверяются все SHA-256.', artifactIds: ['image-1', 'image-2', 'prompts', 'review'] },
  { id: 'ds', name: 'Применение дизайн-системы', status: 'INCOMPLETE', summary: 'Визуальная интерпретация Poker; PNG не содержат проверяемых экземпляров и токенов.', artifactIds: ['review'] },
  { id: 'composition', name: 'Композиция главной', status: 'WARN', summary: 'Два предложения для обсуждения; окончательная композиция и размеры не утверждены.', artifactIds: ['image-1', 'image-2'] },
  { id: 'states', name: 'Состояния и переходы', status: 'INCOMPLETE', summary: 'Показана выбранная Обычная. Поиск соперника, отмена, загрузка и ошибки не покрыты.', artifactIds: ['review'] },
  { id: 'visual', name: 'Визуальное ревью', status: 'WARN', summary: 'Изображения просмотрены. Оба варианта сохраняют крупную иллюстрацию; запрошенная компактность варианта A достигнута частично.', artifactIds: ['image-1', 'image-2', 'review'] },
  { id: 'runtime', name: 'Работа приложения', status: 'INCOMPLETE', summary: 'Текущая сдача — статические картинки по выбору пользователя.', artifactIds: ['review'] },
];
const manifest = {
  schema: 'verifier-design-audit/1', profileId: 'chess', kind: 'concept',
  title: 'Главная / выбор режима · A и B',
  summary: 'Два новых PNG-концепта главной VKChess. Обычная и Рапид, кнопка Играть, профиль, прогресс первых десяти партий. Для обсуждения в этом проекте.',
  capturedAt: new Date(Math.max(...images.map(file => fs.statSync(path.join(sourceDir, file)).mtimeMs))).toISOString(),
  ...(state.audits[0] ? { parentAuditId: state.audits[0].id } : {}),
  source: { kind: 'google-docs', documentId: review.documentId, revision: review.documentRevision },
  target: { kind: 'image-concept' },
  coverage: { expectedSourceFrames: 1, expectedTargetFrames: 2 },
  sources: [{ id: 'gdd-chess', name: 'VKChess: идеи меты · ГДД', targetIds: ['home-a', 'home-b'] }],
  screens: images.map((file, index) => {
    const bytes = fs.readFileSync(path.join(sourceDir, file));
    return { id: index ? 'home-b' : 'home-a', name: names[index], width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sourceIds: ['gdd-chess'], screenshotArtifact: `image-${index + 1}` };
  }),
  checks, artifacts, limitations: review.limitations, findings: [],
};
fs.writeFileSync(path.join(sourceDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const response = await fetch(base + '/api/audits', {
  method: 'POST', headers: { Origin: base, 'X-Verifier-Token': state.csrf, 'Content-Type': 'application/json' },
  body: JSON.stringify(manifest),
});
const result = await response.json();
assert.equal(response.status, 201, JSON.stringify(result));
const stored = Buffer.from(await (await fetch(`${base}/api/audits/${result.id}/report`)).arrayBuffer());
assert.equal(sha(stored), result.manifestHash);
const saved = JSON.parse(stored);
assert.equal(saved.status, 'INCOMPLETE');
for (const artifact of saved.artifacts) {
  const file = await fetch(`${base}/api/audits/${result.id}/artifacts/${artifact.id}`);
  assert.equal(file.status, 200);
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.equal(sha(bytes), artifact.sha256);
  assert.equal(bytes.length, artifact.bytes);
}
const proof = { auditId: result.id, parentAuditId: saved.parentAuditId, storage: 'PASS', design: saved.status, filesVerified: saved.artifacts.length, url: `${base}/?audit=${result.id}` };
fs.writeFileSync(path.join(sourceDir, 'verification.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
