const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function renderProfileRack(data, { online, busy, grid, artwork }) {
  const selectedCase = data.cases[0];
  const disabled = !selectedCase || !online || busy || data.server.activeRun;
  return `<div class="intro-row"><div><span class="eyebrow">ПРОФИЛЬ / ${escape(data.profileId)}</span><h2>${escape(data.project)}</h2><p>Правила, снимки, результаты проверок и история решений для выбранного проекта.</p></div><span class="tag">${selectedCase ? 'ПРОВЕРКИ НАСТРОЕНЫ' : 'INCOMPLETE'}</span></div>
    <section class="panel profile-setup"><div class="panel-header"><span>Подготовка и контроль макетов</span><span>Снимки через ассистента</span></div><div class="design-audit-intro"><div><h3>${escape(selectedCase?.name || 'Настройте первый проверяемый компонент')}</h3><p>${escape(selectedCase?.description || 'Проверки компонентов ещё не настроены. Источники и незакрытые вопросы находятся во вкладке «Правила и источники». Отсутствие проверок не означает готовность макетов.')}</p><p>Проверка геометрии компонента и сетки выполняется отдельно. Соответствие токенам, продуктовые состояния и визуальная приёмка требуют собственных доказательств.</p></div><button class="button primary" data-action="run" ${disabled ? 'disabled' : ''}>Запустить проверку</button></div>
    <div class="rule-strip"><span>Шаг сетки</span>${[2,4,8].map(n => `<button class="button quiet" data-grid="${n}" aria-pressed="${grid === n}">${n}</button>`).join('')}<button class="button quiet" data-action="artwork" role="switch" aria-label="Проверять геометрию иллюстраций" aria-checked="${artwork}">Включая графику</button><button class="button quiet" data-action="capture" ${selectedCase && online ? '' : 'disabled'}>Обновить снимки</button></div></section>`;
}

export function renderEmptyArchive() {
  return '<section class="panel empty">Проверенных расхождений пока нет.<p>Импортируйте доказательства или запустите настроенную проверку. Это состояние INCOMPLETE.</p></section>';
}
