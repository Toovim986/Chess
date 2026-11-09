// Presentation only. All rule decisions come from viewportReview.result.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const count = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU') : '—';
const statuses = { PASS:'Проверка пройдена', WARN:'Есть предупреждения', FAIL:'Есть ошибки', INCOMPLETE:'Недостаточно данных' };
const severities = { error:'Ошибка', warning:'Предупреждение', incomplete:'Не подтверждено' };

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function sourceLink(url, title) {
  const safe = safeUrl(url);
  return safe ? `<a href="${escape(safe)}" target="_blank" rel="noopener noreferrer">${escape(title)} ↗</a>` : `<span>${escape(title)} · ссылка недоступна</span>`;
}

function when(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', ...(String(value).length > 10 ? { hour:'2-digit', minute:'2-digit' } : {}) }) : 'дата не указана';
}

function finding(item, targetFile) {
  const severity = Object.hasOwn(severities, item.severity) ? item.severity : 'incomplete';
  // A path-addressed snapshot ID is not a live Figma node ID; do not link it as one.
  const nodeLink = targetFile && typeof item.nodeId === 'string' && /^(?:I)?\d+:\d+(?:;\d+:\d+)*$/.test(item.nodeId)
    ? sourceLink(`https://www.figma.com/design/${encodeURIComponent(targetFile)}/?node-id=${encodeURIComponent(item.nodeId)}`, 'Слой Figma') : '';
  return `<li class="viewport-finding ${severity}"><div><span class="viewport-severity">${severities[severity]}</span><strong>${escape(item.title || item.code)}</strong></div><p>${escape(item.detail)}</p>${nodeLink ? `<div class="viewport-node-link">${nodeLink}</div>` : ''}</li>`;
}

export function renderViewportReview(review, targetFile) {
  const policy = review?.policy || {}, result = review?.result || {};
  const status = Object.hasOwn(statuses, result.status) ? result.status : 'INCOMPLETE';
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const required = Array.isArray(policy.requiredViewports) ? policy.requiredViewports : [];
  const coverage = Array.isArray(result.coverage) ? result.coverage : [];
  const sizes = required.map(size => ({ ...size, ...coverage.find(row => row.width === size.width && row.height === size.height) }));
  for (const row of coverage) if (!sizes.some(size => size.width === row.width && size.height === row.height)) sizes.push(row);
  const sources = Array.isArray(policy.sources) ? policy.sources : [];
  const baseline = typeof policy.baseline === 'string' ? policy.baseline : policy.baseline?.width
    ? `${count(policy.baseline.width)}${policy.baseline.height ? ` × ${count(policy.baseline.height)}` : ''} px` : '';
  const tallies = Object.keys(severities).map(severity => ({ severity, count:findings.filter(f => f.severity === severity).length }));
  const evidence = typeof result.evidenceKind === 'string' && /figma/i.test(result.evidenceKind) ? 'Снимки Figma' : 'Сохранённые данные';
  return `<section class="panel viewport-review" aria-labelledby="viewport-review-title">
    <header class="viewport-heading"><div><span class="eyebrow">ПРАВИЛО VIEWPORT</span><h2 id="viewport-review-title">Viewport и доступность контента</h2></div><div class="viewport-result"><span class="tag viewport-status ${status.toLowerCase()}" data-viewport-status="${status}">${status}</span><span>${statuses[status]}</span></div></header>
    <div class="viewport-meta"><span>${evidence} · ${escape(when(result.capturedAt))}</span><span>Проверено экранов: <b>${count(result.checkedScreens)}</b></span>${baseline ? `<span>Базовый viewport: ${escape(baseline)}</span>` : ''}<span>Правило ${escape(result.ruleVersion ?? policy.version ?? '—')}${policy.verifiedAt ? ` · сверено ${escape(when(policy.verifiedAt))}` : ''}</span></div>
    <ul class="viewport-matrix" aria-label="Матрица контрольных размеров">${sizes.map(size => `<li><div class="viewport-size">${count(size.width)} × ${count(size.height)} <span>px</span></div>${size.label ? `<span class="viewport-device">${escape(size.label)}</span>` : ''}<div class="viewport-coverage"><b>${count(size.present)}</b> / ${count(size.expected)} <span>экранов</span></div></li>`).join('') || '<li class="viewport-no-data">Матрица размеров пока недоступна.</li>'}</ul>
    <div class="viewport-summary" aria-label="Результаты правила">${tallies.map(item => `<span class="${item.severity}">${severities[item.severity]}: <b>${item.count}</b></span>`).join('')}</div>
    ${findings.length ? `<ul class="viewport-findings">${findings.slice(0,4).map(item => finding(item, targetFile)).join('')}</ul>${findings.length > 4 ? `<details class="viewport-more"><summary>Остальные замечания (${findings.length - 4})</summary><ul class="viewport-findings">${findings.slice(4).map(item => finding(item, targetFile)).join('')}</ul></details>` : ''}` : `<p class="viewport-empty">${status === 'PASS' ? 'В пределах сохранённых данных замечаний нет.' : 'Подробности проверки пока недоступны.'}</p>`}
    <p class="viewport-evidence-note">Снимки Figma — не проверка живого браузера. Runtime, системные safe area и скролл требуют отдельных доказательств.</p>
    <footer class="viewport-footer"><span>Автоматически пересчитывается по локальным данным при обновлении пульта.</span>${sources.length ? `<nav class="viewport-sources" aria-label="Источники правила viewport">${sources.map(source => sourceLink(source.url, source.title)).join('')}</nav>` : '<span>Источники правила пока недоступны.</span>'}</footer>
  </section>`;
}
