import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const revision = 'chess-ds-2026-10-27-v4';
const sourceDir = path.join(root, 'artifacts/screens', revision);
const incoming = path.join(root, 'tools/design-verifier/profiles/chess/incoming', revision);
const base = 'http://127.0.0.1:43132';
const title = 'Экраны по ГДД из Poker lib + экран партии';
const parentAuditId = 'audit-1793104228309-eb7404';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Poker lib component nodes are the sources; header and navigation icons appear on every screen.
const lib = {
  avatar: ['4732:175047', 'CustomizedAvatar'], badge: ['248:13522', 'badge no level'], progressbar: ['5812:65920', 'progressbar'],
  tab: ['679:64732', 'tab'], button: ['289:2298', 'Button'], iconButton: ['595:71500', 'icon Button'], labels: ['1102:125649', 'labels'],
  cell: ['770:128735', 'cell'], colors: ['391:21239', 'Color · переменные Poker lib'], stopwatch: ['3006:12693', 'stopwatch-start'],
  flash: ['421:59939', 'flash'], gift: ['788:100114', 'gift_filled_M'], shield: ['7427:78630', 'shield-crown'], user: ['3309:170207', 'user_circle'],
  check: ['652:62701', 'check_circle_large_filled_S'], notification: ['6204:114300', 'notification_filled'], settings: ['1578:149054', 'settings-sharp'],
  plus: ['536:50354', 'plus'], info: ['1186:131152', 'info_circle_filled'], clock: ['6219:130458', 'Time_clock_circle_filled'],
  star: ['652:61336', 'star_circle_filled_M'], arrow: ['7977:25658', 'top arrow_filled'], timer: ['425:20163', 'timer new'],
  list: ['3149:156493', 'list'], bubble: ['6965:218219', 'bubble_filled_M'], chevron: ['692:66907', 'chevron-down'],
};
const shell = ['colors', 'notification', 'settings', 'stopwatch', 'check', 'shield', 'user', 'button'];
const uses = {
  home: [...shell, 'avatar', 'badge', 'progressbar', 'tab', 'flash', 'gift'],
  profile: [...shell, 'avatar', 'badge', 'progressbar', 'labels', 'iconButton', 'plus', 'info'],
  tasks: [...shell, 'gift', 'progressbar', 'clock', 'tab', 'labels', 'star', 'arrow'],
  league: [...shell, 'labels', 'cell'],
  result: [...shell, 'avatar', 'badge', 'progressbar', 'tab', 'flash', 'gift', 'labels'],
  // The game screen hides the shared header and navigation.
  game: ['colors', 'avatar', 'tab', 'button', 'iconButton', 'labels', 'timer', 'list', 'bubble', 'chevron'],
};
const items = [
  { id: '6:2109', name: '01 · Главная / выбор режима', file: '01-home.png', w: 375, h: 812, uses: uses.home, role: 'screen' },
  { id: '7:937', name: '02 · Профиль', file: '02-profile.png', w: 375, h: 812, uses: uses.profile, role: 'screen' },
  { id: '7:1147', name: '03 · Задачи', file: '03-tasks.png', w: 375, h: 812, uses: uses.tasks, role: 'screen' },
  { id: '7:3153', name: '04 · Лига', file: '04-league.png', w: 375, h: 812, uses: uses.league, role: 'screen' },
  { id: '9:734', name: '05 · Результат партии · победа', file: '05-result-win.png', w: 375, h: 812, uses: uses.result, role: 'screen' },
  { id: '9:941', name: '06 · Результат партии · поражение', file: '06-result-loss.png', w: 375, h: 812, uses: uses.result, role: 'screen' },
  { id: '25:1047', name: '07 · Партия', file: '07-game.png', w: 375, h: 812, uses: uses.game, role: 'screen' },
  { id: '14:1142', name: 'Карта передачи · 01 Главная', file: 'map-01-home.png', w: 1040, h: 1669, uses: uses.home, role: 'screen-map' },
  { id: '14:1417', name: 'Карта передачи · 02 Профиль', file: 'map-02-profile.png', w: 1040, h: 1532, uses: uses.profile, role: 'screen-map' },
  { id: '14:1722', name: 'Карта передачи · 03 Задачи', file: 'map-03-tasks.png', w: 1040, h: 1740, uses: uses.tasks, role: 'screen-map' },
  { id: '14:2140', name: 'Карта передачи · 04 Лига', file: 'map-04-league.png', w: 1040, h: 1812, uses: uses.league, role: 'screen-map' },
  { id: '14:2507', name: 'Карта передачи · 05–06 Результат партии', file: 'map-05-result.png', w: 1040, h: 1415, uses: uses.result, role: 'screen-map' },
  { id: '28:2146', name: 'Карта передачи · 07 Партия', file: 'map-06-game.png', w: 1040, h: 1549, uses: uses.game, role: 'screen-map' },
  { id: '29:2291', name: 'Обзор · все экраны и покрытие DS', file: '00-overview.png', w: 3041, h: 1217, uses: Object.keys(lib), role: 'overview' },
];
const reports = [['ds-audit', 'Аудит применения DS (измерения)', 'ds-audit.json'], ['handoff-map', 'Карта передачи · JSON', 'handoff-map.json'], ['review', 'Визуальное ревью и ограничения', 'review.json']];

const state = await fetch(base + '/api/state').then(response => response.json());
assert.equal(state.profileId, 'chess');
assert.ok(!state.audits.some(audit => audit.title === title), 'Revision already imported');
assert.ok(state.audits.some(audit => audit.id === parentAuditId), 'Parent revision missing');
fs.mkdirSync(incoming, { recursive: false });
for (const file of [...items.map(i => i.file), ...reports.map(r => r[2])]) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(incoming, file), fs.constants.COPYFILE_EXCL);
  assert.equal(sha(fs.readFileSync(path.join(sourceDir, file))), sha(fs.readFileSync(path.join(incoming, file))));
}
const artifactId = item => item.file.replace('.png', '');
const artifacts = [
  ...items.map(i => ({ id: artifactId(i), label: i.name, role: i.role, path: `${revision}/${i.file}` })),
  ...reports.map(([id, label, file]) => ({ id, label, role: 'report', path: `${revision}/${file}` })),
];
const screenIds = items.filter(i => i.role === 'screen').map(artifactId);
const mapIds = items.filter(i => i.role === 'screen-map').map(artifactId);
const checks = [
  { id: 'storage', name: 'Сохранность файлов', status: 'PASS', summary: 'Байты поставки скопированы с проверкой SHA-256; после импорта повторно скачиваются и сверяются все файлы.', artifactIds: artifacts.map(a => a.id) },
  { id: 'ds', name: 'Применение дизайн-системы', status: 'WARN', summary: 'Экраны собраны из экземпляров Poker lib: 10–32 экземпляра на экран; все заливки и обводки вне экземпляров привязаны к переменным Color (HEX вне DS: 0 на 7 экранах и 5 локальных компонентах, включая доску и фигуры); шрифты только Montserrat и Alumni Sans. Открыты пробелы DS: фигуры, доска, иконка пешки, эмблемы лиг, иконки навигации и действий партии, CTA только 32 px, заголовок 40 px, маркер сложности.', artifactIds: ['ds-audit', '00-overview'] },
  { id: 'handoff', name: 'Карта передачи во фронт', status: 'WARN', summary: 'Шесть карт по формату эталона mKX13PSo2vqwCXCBQJiOi8: номера, границы, компонент и вариант, токены, шрифты сгенерированы из узлов сборки. Назначение, данные и поведение — предложение для подтверждения владельцем продукта.', artifactIds: [...mapIds, 'handoff-map'] },
  { id: 'composition', name: 'Композиция', status: 'WARN', summary: 'Мобильные экраны 375×812 по размеру эталона. Композиция и viewport-политика шахмат не утверждены.', artifactIds: [...screenIds, 'review'] },
  { id: 'states', name: 'Состояния и переходы', status: 'INCOMPLETE', summary: 'Собраны основные состояния, экран партии (ход игрока, выбранная фигура, допустимые ходы) и исходы (победа, поражение). Поиск соперника, загрузка, ошибки, пустые состояния, шах и мат, подтверждения сдачи и ничьей, повышение/понижение лиги не собраны.', artifactIds: ['review', 'handoff-map'] },
  { id: 'visual', name: 'Визуальное ревью', status: 'WARN', summary: 'Каждый экран и карта просмотрены. Исправлено: доля заливки progressbar, обрезанная строка лиги, разные портреты, перекрытие бейджей карты, контраст тёмных клеток доски, обрезанная метка уровня. Остаётся: CTA 32 px. Экран партии собран по анализу референсов: Chess.com, ChessGold, Chess Clash, Chess Royale, Clash of Kings, Lichess.', artifactIds: [...screenIds, ...mapIds, 'review'] },
  { id: 'runtime', name: 'Работа приложения', status: 'INCOMPLETE', summary: 'Сдача — скриншоты для обсуждения; измерений в приложении нет.', artifactIds: ['review'] },
];
const findings = [
  { id: 'gap-pawn', nodeId: '5:1110', severity: 'warning', status: 'OPEN', title: 'Нет иконки валюты «пешки» в Poker lib', detail: 'Временная векторная иконка в цвете text & element/gold primary. Нужен ассет DS.', artifactIds: ['ds-audit'] },
  { id: 'gap-league-emblem', nodeId: '7:3153', severity: 'warning', status: 'OPEN', title: 'Нет эмблем лиг', detail: 'Временно shield-crown на фоне violet a10.', artifactIds: ['04-league', 'map-04-league'] },
  { id: 'gap-nav-icons', nodeId: '5:1256', severity: 'warning', status: 'OPEN', title: 'Иконки навигации шахмат временные', detail: 'stopwatch-start, check_circle_large_filled_S, shield-crown, user_circle из Poker lib.', artifactIds: ['ds-audit'] },
  { id: 'gap-cta-size', nodeId: '6:2109', severity: 'warning', status: 'OPEN', title: 'Залитая Button Gold/Colored только размера S (32 px)', detail: 'Для мобильного CTA нужен размер ≥ 40 px или подтверждение S владельцем DS.', artifactIds: ['01-home', 'ds-audit'] },
  { id: 'gap-type-40', nodeId: '9:734', severity: 'info', status: 'OPEN', title: 'Заголовок итога партии 40 px', detail: 'Alumni Sans Bold Italic 40 — в компонентах DS максимум 30.', artifactIds: ['05-result-win'] },
  { id: 'fix-progress', nodeId: '6:2109', severity: 'warning', status: 'FIXED', title: 'Доля заливки progressbar не соответствовала данным', detail: 'LESSON-INSTANCE-01: растянутый экземпляр сохранял заливку ~86%. Индикатор собран из progressbar/empty и progressbar/full по доле.', artifactIds: ['01-home', 'review'], before: { expFillPx: 301, bonusFillPx: 277 }, after: { expFillPx: 271, bonusFillPx: 97 } },
  { id: 'fix-league-row', nodeId: '7:3153', severity: 'warning', status: 'FIXED', title: 'Обрезанная строка дивизиона', detail: 'Оставлены 4 полные строки и подсказка о прокрутке.', artifactIds: ['04-league'], before: { listHeightPx: 317 }, after: { listHeightPx: 301 } },
  { id: 'fix-identity', nodeId: '7:937', severity: 'info', status: 'FIXED', title: 'Разные портреты игрока на экранах', detail: 'Один вариант CustomizedAvatar 136 и одно имя на всех экранах.', artifactIds: ['01-home', '02-profile'], before: { profileAvatar: 'Size=106' }, after: { profileAvatar: 'Size=136' } },
  { id: 'fix-map-badges', nodeId: '14:1142', severity: 'info', status: 'FIXED', title: 'Бейджи карты перекрывали интерфейс', detail: 'Бейджи вынесены в поле слева с выносными линиями.', artifactIds: ['map-01-home'] },
  { id: 'gap-pieces', nodeId: '23:1134', severity: 'warning', status: 'OPEN', title: 'Нет шахматных фигур в Poker lib', detail: 'Временно набор cburnett (CC BY-SA 3.0), цвета привязаны к white/l100 и black/l0. Нужен набор фигур DS.', artifactIds: ['07-game', 'ds-audit'] },
  { id: 'gap-board', nodeId: '23:1135', severity: 'info', status: 'OPEN', title: 'Цвета доски — предложение', detail: 'chess/Board на токенах ch40/gold l80 / l60; нужно решение владельца DS.', artifactIds: ['07-game', 'map-06-game'] },
  { id: 'gap-game-actions', nodeId: '25:1047', severity: 'warning', status: 'OPEN', title: 'Нет иконок действий партии', detail: 'Сдаться и ничья — текстовые кнопки; стрелки ходов — повёрнутая icon Button с chevron-down.', artifactIds: ['07-game', 'map-06-game'] },
  { id: 'fix-board-contrast', nodeId: '23:1135', severity: 'warning', status: 'FIXED', title: 'Чёрные фигуры терялись на тёмных клетках', detail: 'Тёмные клетки переведены на ch40/gold/l60, координаты на светлых клетках — l40.', artifactIds: ['07-game'], before: { darkSquare: '#4E4739' }, after: { darkSquare: '#8A7F67' } },
  { id: 'fix-level-label', nodeId: '25:1047', severity: 'info', status: 'FIXED', title: 'Метка уровня обрезалась рядом с именем', detail: 'Метка перенесена во вторую строку к взятым фигурам.', artifactIds: ['07-game'] },
];
const sourceIdsByItem = new Map(items.map(i => [i.id, [...new Set(i.uses)].map(k => lib[k][0])]));
const sources = Object.values(lib).map(([id, name]) => ({ id, name, targetIds: items.filter(i => sourceIdsByItem.get(i.id).includes(id)).map(i => i.id) }));
const capturedAt = new Date(Math.max(...items.map(i => fs.statSync(path.join(sourceDir, i.file)).mtimeMs))).toISOString();
const manifest = {
  schema: 'verifier-design-audit/1', profileId: 'chess', kind: 'revision', title, parentAuditId, capturedAt,
  summary: 'Семь мобильных экранов шахмат по ГДД (главная, профиль, задачи, лига, партия, итог партии) собраны из экземпляров ♦️ Poker lib и переменных Color; экран партии — по анализу референсов топовых шахматных приложений. Шесть карт передачи во фронт по эталону и обзор. Скриншоты также размещены в Figma-файле «Шахматы» 3XFu7HJrZfIFVVmlVhhi85.',
  source: { fileKey: 'XSrnXoAtfXrNMIH1mFPjGc', pageId: '391:21239' },
  target: { fileKey: 'QZNrOb57obLvLAadEMSjV3', pageId: '0:1' },
  coverage: { expectedSourceFrames: sources.length, expectedTargetFrames: items.length },
  sources,
  screens: items.map(i => ({ id: i.id, name: i.name, width: i.w, height: i.h, sourceIds: sourceIdsByItem.get(i.id), screenshotArtifact: artifactId(i) })),
  checks, artifacts, findings,
  limitations: JSON.parse(fs.readFileSync(path.join(sourceDir, 'review.json'), 'utf8')).limitations,
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
for (const artifact of saved.artifacts) {
  const file = await fetch(`${base}/api/audits/${result.id}/artifacts/${artifact.id}`);
  assert.equal(file.status, 200);
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.equal(sha(bytes), artifact.sha256);
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(sha(bytes), sha(fs.readFileSync(path.join(sourceDir, path.basename(artifact.originalPath)))));
}
const proof = { auditId: result.id, parentAuditId: saved.parentAuditId, storage: 'PASS', design: saved.status, filesVerified: saved.artifacts.length, screens: saved.screens.length, sources: saved.sources.length, url: `${base}/?audit=${result.id}` };
fs.writeFileSync(path.join(sourceDir, 'verification.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
