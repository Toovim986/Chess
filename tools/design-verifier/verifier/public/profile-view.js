const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function renderProfileRack(data, { online, busy, grid, artwork }) {
  const selectedCase = data.cases[0];
  const disabled = !selectedCase || !online || busy || data.server.activeRun;
  return `<section class="panel profile-setup control-panel"><span class="eyebrow">Локальный движок</span><h3>${escape(selectedCase?.name || 'Проверка компонента')}</h3><p>${escape(selectedCase?.description || 'Сначала назначьте компонент и пару снимков. Проверки пока не настроены: INCOMPLETE.')}</p><div class="control-options"><span>Шаг сетки, px</span><div class="grid-options" role="group" aria-label="Шаг пиксельной сетки">${[2,4,8].map(n=>`<button data-grid="${n}" aria-pressed="${grid===n}">${n}</button>`).join('')}</div></div><div class="toggle-row"><button class="toggle" data-action="artwork" role="switch" aria-label="Проверять геометрию иллюстраций" aria-checked="${artwork}"></button><span>Включая графику</span></div><button class="button primary" data-action="run" ${disabled ? 'disabled' : ''}>${data.server.activeRun?'Идёт проверка…':'Запустить проверку'}</button>${selectedCase?`<button class="text-link inline-button" data-action="capture" style="margin-top:16px" ${online?'':'disabled'}>Обновить снимки ↗</button>`:''}</section>`;
}

export function renderEmptyArchive() {
  return '<section class="panel empty-state"><span class="icon" style="--icon:url(\'/assets/phosphor/arrows-left-right.svg\')" aria-hidden="true"></span><h3>Расхождений пока нет в журнале</h3><p>Импортируйте доказательства или запустите настроенную проверку. До этого результат остаётся INCOMPLETE.</p><button class="text-link inline-button" data-view="knowledge">Посмотреть условия проверки →</button></section>';
}
