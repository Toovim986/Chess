// Deliberately independent of source fidelity and pixel-grid checks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadProfile, unavailableViewport } from './profile.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const engine = path.join(repo, 'profiles/poker');
const evidence = path.join(repo, 'profiles/poker');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const numeric = n => typeof n === 'number' && Number.isFinite(n);
const positive = n => numeric(n) && n > 0;
const rect = r => r && ['x', 'y', 'width', 'height'].every(k => numeric(r[k])) && r.width > 0 && r.height > 0;
const viewportKey = r => `${r.width}x${r.height}`;

export function evaluateViewport(input, policy) {
  const findings = [];
  const add = (code, severity, title, detail, nodeId) => findings.push({code, severity, title, detail, ...(nodeId ? {nodeId} : {})});
  // Legacy captures have no surface field and retain the complete Home contract.
  const productSurface = input.productSurface ?? 'home';
  const shop = productSurface === 'shop';
  if (!['home', 'shop'].includes(productSurface))
    add('PRODUCT_SURFACE', 'incomplete', 'Неизвестная поверхность продукта', 'Поддерживаются home и shop; отсутствие поля означает прежнюю проверку Главной.');
  const missingCritical = items => shop
    ? ['header', 'content'].filter(role => !items.some(c => c.role === role)).concat(items.some(c => ['action', 'cta'].includes(c.role)) ? [] : ['action/cta'])
    : ['cta', 'profile', 'activities'].filter(role => !items.some(c => c.role === role));
  // Shop cards already use 44 px actions; the shared primary CTA remains 48 px.
  const minimumHeight = role => role === 'cta' ? policy.projectConstraints.ctaMinHeight : shop && role === 'action' ? 44 : null;
  const eps = policy.projectConstraints.geometryTolerance;
  const near = (a, b) => Math.abs(a - b) <= eps;
  const states = input.expectedStates || [];
  const validStates = new Set(states);
  if (!states.length || states.length !== validStates.size || states.some(s => typeof s !== 'string'))
    add('VIEWPORT_MANIFEST', 'incomplete', 'Нет достоверного списка состояний', 'Нужны уникальные идентификаторы исходных состояний.');
  if (input.unit !== 'CSS px') add('VIEWPORT_UNIT', 'error', 'Неверная единица размеров', 'Используйте CSS px; физические пиксели матрицы не являются viewport.');
  const screens = Array.isArray(input.screens) ? input.screens : [];
  const seen = new Set(), counts = new Map();
  let checkedScreens = 0;
  for (const s of screens) {
    const id = s?.nodeId;
    if (!id || seen.has(id) || !validStates.has(s.sourceState)) {
      add('VIEWPORT_IDENTITY', 'error', 'Повторный или неизвестный экран', 'Каждый экран должен иметь уникальный nodeId и известное исходное состояние.', id);
      continue;
    }
    seen.add(id);
    if (!positive(s.width) || !positive(s.height) || !Number.isInteger(s.width) || !Number.isInteger(s.height)) {
      add('VIEWPORT_DIMENSIONS', 'error', 'Некорректный размер frame', 'Нужны положительные целые размеры в CSS px.', id); continue;
    }
    const key = viewportKey(s);
    if (!counts.has(key)) counts.set(key, new Set());
    if (counts.get(key).has(s.sourceState)) add('VIEWPORT_DUPLICATE_STATE', 'error', 'Дублирующееся состояние', `${key}: повтор ${s.sourceState}`, id);
    counts.get(key).add(s.sourceState);
    checkedScreens++;
    const nav = s.navigation;
    if (!rect(nav) || typeof nav.outsideScroll !== 'boolean') {
      add('NAV_EVIDENCE', 'incomplete', 'Нет геометрии нижнего меню', 'Нужны bounds и положение меню относительно области прокрутки.', id); continue;
    }
    if (!near(nav.x, 0) || !near(nav.width, s.width) || !near(nav.height, policy.projectConstraints.navigationHeight) || !near(nav.y + nav.height, s.height) || !nav.outsideScroll)
      add('NAV_LAYOUT', 'error', 'Нарушено положение нижнего меню', 'Меню должно занимать ширину frame, находиться у нижней границы и вне прокручиваемого содержимого.', id);
    const view = s.contentViewport;
    if (!rect(view) || !positive(s.contentHeight) || typeof s.verticalScroll !== 'boolean') {
      add('SCROLL_EVIDENCE', 'incomplete', 'Не определена доступная область', 'Нужны bounds области контента, высота содержимого и подтверждённый режим прокрутки.', id); continue;
    }
    const contentFits = shop
      ? view.y >= 0 && near(view.y + view.height, nav.y)
      : near(view.y, 0) && near(view.height, nav.y);
    if (!near(view.x, 0) || !near(view.width, s.width) || !contentFits)
      add('CONTENT_NAV_OVERLAP', 'error', 'Область контента пересекает меню', 'Область просмотра должна заканчиваться у верхней границы закреплённого меню.', id);
    const critical = Array.isArray(s.critical) ? s.critical : [];
    const missing = missingCritical(critical);
    if (missing.length)
      add('CRITICAL_EVIDENCE', 'incomplete', 'Не все ключевые блоки измерены', `Не измерены: ${missing.join(', ')}.`, id);
    for (const c of critical) {
      if (!rect(c)) { add('CRITICAL_BOUNDS', 'incomplete', 'Нет bounds ключевого блока', c.role || 'Неизвестный блок', id); continue; }
      // Coordinates are logical content coordinates, independent of the initial scroll offset.
      if (c.x < -eps || c.x + c.width > view.width + eps)
        add('HORIZONTAL_OVERFLOW', 'error', 'Ключевой блок выходит по ширине', `${c.role}: x=${c.x}, width=${c.width}, viewport=${view.width}.`, id);
      const fixed = shop && c.position === 'fixed';
      if (shop && c.role === 'header' && !fixed)
        add('HEADER_POSITION', 'incomplete', 'Не подтверждено положение шапки', 'Шапка Магазина находится вне прокрутки; передайте position: fixed и bounds относительно frame.', id);
      const reachableHeight = fixed ? nav.y : s.verticalScroll ? s.contentHeight : view.height;
      const visibleHeight = fixed ? nav.y : view.height;
      if (c.y < -eps || c.y + c.height > reachableHeight + eps || c.height > visibleHeight + eps)
        add('CONTENT_UNREACHABLE', 'error', 'Ключевой блок недоступен целиком', `${c.role}: bottom=${c.y + c.height}, доступно=${reachableHeight}, scroll=${s.verticalScroll}.`, id);
      const minimum = minimumHeight(c.role);
      if (minimum !== null && c.height < minimum - eps)
        add(c.role === 'cta' ? 'CTA_PROJECT_MIN' : 'ACTION_PROJECT_MIN', 'error', 'Действие ниже проектного минимума', `Высота ${c.height}; для ${c.role} требуется ${minimum} CSS px.`, id);
    }
  }
  const coverage = policy.requiredViewports.map(v => ({...v, present: counts.get(viewportKey(v))?.size || 0, expected: validStates.size}));
  for (const v of coverage) if (!v.expected || v.present !== v.expected)
    add('VIEWPORT_COVERAGE', 'incomplete', `Не хватает макетов ${v.width}×${v.height}`, `Есть ${v.present} из ${v.expected} исходных состояний.`);
  const designEnd = findings.length;
  const samples = Array.isArray(input.runtimeSamples) ? input.runtimeSamples : [];
  const validScenarios = new Set();
  for (const sample of samples) {
    const prefix = `${sample.scenario || 'unknown'}: `;
    const v = sample.visualViewport, insets = sample.effectiveInsets;
    if (!rect(v) || typeof sample.environment !== 'string' || !sample.environment.trim() || !sample.capturedAt || !Number.isFinite(Date.parse(sample.capturedAt)) || typeof sample.artifact !== 'string' || !sample.artifact.trim() ||
        !['host-already-applied', 'app-applies'].includes(sample.insetOwnership) || !insets ||
        !['top', 'right', 'bottom', 'left'].every(k => numeric(insets[k]) && insets[k] >= 0) || !Array.isArray(sample.criticalRects) || !sample.criticalRects.length ||
        !sample.criticalRects.every(c => rect(c) && ['fixed', 'content'].includes(c.position))) {
      add('RUNTIME_EVIDENCE', 'incomplete', 'Неполное измерение браузера', prefix + 'Нужны среда, дата, артефакт, visual viewport, эффективные insets и bounds доступных контролов.'); continue;
    }
    if (sample.insetOwnership === 'host-already-applied' && Object.values(insets).some(n => n !== 0)) {
      add('SAFE_AREA_DOUBLE_COUNT', 'error', 'Безопасные отступы учтены дважды', prefix + 'Для уже уменьшенного host окна эффективные дополнительные insets должны быть нулевыми.'); continue;
    }
    const safe = {x: v.x + insets.left, y: v.y + insets.top, width: v.width - insets.left - insets.right, height: v.height - insets.top - insets.bottom};
    if (!rect(safe)) { add('SAFE_AREA_INVALID', 'error', 'Отступы не помещаются в окно', prefix + 'Проверьте единицы и источник insets.'); continue; }
    const start = findings.length;
    const fixedNav = sample.criticalRects.find(c => c.position === 'fixed' && c.role === 'navigation');
    for (const c of sample.criticalRects) {
      if (c.x < safe.x - eps || c.x + c.width > safe.x + safe.width + eps || c.y < safe.y - eps || c.y + c.height > safe.y + safe.height + eps)
        add('RUNTIME_OCCLUSION', 'error', 'Контрол перекрыт или находится вне доступного окна', prefix + (c.role || 'контрол') + ': bounds сняты в позиции, в которой контрол должен быть доступен.');
      const minimum = minimumHeight(c.role);
      if (minimum !== null && c.height < minimum - eps)
        add(c.role === 'cta' ? 'CTA_PROJECT_MIN' : 'ACTION_PROJECT_MIN', 'error', 'Действие ниже проектного минимума в браузере', prefix + `Высота ${c.height}; для ${c.role} требуется ${minimum} CSS px.`);
      if (fixedNav && c.role !== 'navigation' && c.x < fixedNav.x + fixedNav.width - eps && c.x + c.width > fixedNav.x + eps &&
          c.y < fixedNav.y + fixedNav.height - eps && c.y + c.height > fixedNav.y + eps)
        add('RUNTIME_NAV_OVERLAP', 'error', 'Контрол перекрыт нижним меню', prefix + c.role + ': его проверяемая позиция пересекает закреплённую навигацию.');
    }
    if (!sample.criticalRects.some(c => c.position === 'fixed' && c.role === 'navigation')) {
      add('RUNTIME_NAV_EVIDENCE', 'incomplete', 'Не измерено закреплённое меню', prefix + 'Нужна фактическая интерактивная область меню в visual viewport.');
    }
    const missingRoles = missingCritical(sample.criticalRects);
    if (missingRoles.length) add('RUNTIME_CRITICAL_EVIDENCE', 'incomplete', 'Не измерен доступ к ключевым блокам', prefix + missingRoles.join(', ') + '. Допустимы снимки после прокрутки; их положения нужно зафиксировать в артефакте.');
    if (findings.length === start) validScenarios.add(sample.scenario);
  }
  const missingRuntime = policy.requiredRuntimeScenarios.filter(s => !validScenarios.has(s));
  if (missingRuntime.length) add('RUNTIME_SCENARIOS', 'incomplete', 'Нет полной проверки браузера и host', `Не подтверждены: ${missingRuntime.join(', ')}. Геометрия Figma не заменяет эти измерения.`);
  if (!samples.length) add('SAFE_AREA_UNKNOWN', 'incomplete', 'Safe area пока не измерена', 'Не назначаем телефону фиксированный inset. Нужны данные среды и явный владелец отступов: host или приложение.');
  const statusOf = values => values.some(f => f.severity === 'error') ? 'FAIL' : values.some(f => f.severity === 'incomplete') ? 'INCOMPLETE' : values.some(f => f.severity === 'warning') ? 'WARN' : 'PASS';
  return {status: statusOf(findings), designStatus: statusOf(findings.slice(0, designEnd)), productSurface, checkedScreens, coverage, findings,
    capturedAt: input.capturedAt || null, evidenceKind: input.evidenceKind || 'unknown', runtimeSamples: samples.length,
    ruleVersion: policy.version, inputHash: sha(JSON.stringify(input))};
}

export function getViewportReview({inputPath = path.join(evidence, 'viewport-input.json'), policyPath = path.join(engine, 'viewport-policy.json')} = {}) {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, ''));
  if (input.productSurface === 'shop') policy.scope = 'Магазин Mobile: геометрия макетов и отдельные измерения среды исполнения';
  return {policy, result: evaluateViewport(input, policy)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--input')) throw new Error('Usage: node verifier/viewport.mjs [--input PATH]');
  const profile = loadProfile();
  const review = profile.config.viewport ? getViewportReview({
    inputPath: args.length ? path.resolve(args[1]) : path.join(profile.profileRoot, profile.config.viewport.input),
    policyPath: path.join(profile.profileRoot, profile.config.viewport.policy)
  }) : unavailableViewport();
  console.log(JSON.stringify(review, null, 2));
  process.exitCode = review.result.status === 'PASS' ? 0 : review.result.status === 'FAIL' ? 1 : 2;
}
