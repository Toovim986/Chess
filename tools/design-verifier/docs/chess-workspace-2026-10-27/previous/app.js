import { renderScreenMap } from './screen-map-view.js';
import { renderEmptyArchive } from './profile-view.js';
import { renderDashboard } from './dashboard.js';
import { renderKnowledge } from './knowledge-view.js';
import { renderViewportReview } from './viewport-review.js';
import { renderAuditOverview, renderDesignAudits } from './design-audits.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => typeof value === 'number' ? value.toLocaleString('ru-RU', { maximumFractionDigits: 3 }) : escape(value ?? '—');
const date = (value, time = false) => value ? new Date(value).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', ...(time && value.length > 10 ? {hour:'2-digit',minute:'2-digit'} : {}) }) : '—';
const labels = { PASS:'Проверка пройдена', PASS_WITH_ROUNDING:'Совпадает с допуском Figma', FAIL:'Есть расхождения', WARN:'Есть предупреждения', INCOMPLETE:'Недостаточно данных', RUNNING:'Проверяется', ERROR:'Ошибка запуска', INTERRUPTED:'Запуск прерван' };
function closeNavigation() { document.body.classList.remove('nav-open'); document.querySelector('[data-action=menu]').setAttribute('aria-expanded','false'); document.querySelector('#app').inert=false; document.querySelector('.site-footer').inert=false; }
const kinds = {note:'Заметка',attention:'Внимание',decision:'Решение',recheck:'Повторная проверка'};
let data, fingerprint, view = 'overview', board = 'lk', mode = 'archive', selected, selectedRun, grid = 2, artwork = false, search = '', errorsOnly = false, online = false, busy = false, split = 50;
let draft = { text:'', kind:'note', target:'project' };
let selectedAudit, auditDetail;
let knowledge, knowledgeError;
let screenMapReference, screenMapError, screenMapMode = 'mobile';
let chessMapSelected = 'home', chessMapVariant = 'a';
async function openScreenMap() {
  view = 'screen-map'; screenMapError = null; render();
  history.replaceState(null, '', '?view=screen-map');
  try {
    if (!screenMapReference) {
      const chess = data?.profileId === 'chess';
      const response = await fetch(chess ? '/screen-map/chess.json' : '/screen-map/reference.json');
      if (!response.ok) throw new Error('Не удалось прочитать карту экранов проекта.');
      const reference = await response.json();
      if (chess ? reference.schema !== 'verifier-chess-screen-map/1' || !Array.isArray(reference.screens) || !reference.screens.length : reference.schema !== 'verifier-screen-map-reference/1' || !Array.isArray(reference.pages)) throw new Error('Некорректная структура карты экранов.');
      screenMapReference = reference;
    }
  } catch (error) { screenMapError = error.message; }
  render();
}
async function openKnowledge() {
  view = 'knowledge'; knowledgeError = null; render();
  try {
    const response = await fetch('/api/context');
    if (!response.ok) throw new Error('Не удалось прочитать контекст проекта');
    knowledge = await response.json();
  } catch (error) { knowledge = null; knowledgeError = error.message; }
  render();
}
async function openAudit(id) {
  selectedAudit = id; view = 'audits'; render();
  const response = await fetch(`/api/audits/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('Не удалось прочитать ревизию');
  const result = await response.json(); if (selectedAudit === id && view === 'audits') { auditDetail = result; history.replaceState(null, '', `?audit=${encodeURIComponent(id)}`); render(); }
}
const latest = () => data.runs.find(r => r.status !== 'RUNNING');
const currentRun = () => data.runs.find(r => r.id === selectedRun) || latest();
const link = (url, text, cls = 'text-link') => `<a class="${cls}" href="${escape(url)}" target="_blank" rel="noreferrer">${text} ↗</a>`;
const targetUrl = id => data.targetFile ? `https://www.figma.com/design/${encodeURIComponent(data.targetFile)}/?node-id=${encodeURIComponent(id)}` : '';
const badge = status => `<span data-status="${escape(status)}" class="tag ${status?.startsWith('PASS') ? 'green' : ''}" title="${escape(labels[status]||'Проверка ещё не запущена')}">${escape(status || 'НЕ ЗАПУЩЕН')}</span>`;
function notify(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(notify.timer); notify.timer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
async function refresh(force = false) {
  try {
    const response = await fetch('/api/state'); if (!response.ok) throw new Error('Сервис недоступен');
    const next = await response.json(); online = true;
    const key = JSON.stringify({...next, server:{startedAt:next.server.startedAt,activeRun:next.server.activeRun}});
    data = next;
    if (!data.boards.some(b => b.id === board)) board = data.boards[0]?.id;
    document.title = `Верификатор · ${data.project}`;
    $('.workspace-label').textContent = data.project;
    $('.brand-line').textContent = 'Рабочее пространство дизайна';
    const reference = document.getElementById('design-reference');
    reference.hidden = !data.designReference;
    if (data.designReference) reference.href = data.designReference;
    if (force || key !== fingerprint) { fingerprint = key; render(); }
    $('#connection').className = 'connection online';
    $('#connection').innerHTML = `<i class="led"></i><span>${data.server.activeRun ? 'Проверка выполняется' : 'Сервис на связи'}</span>`;
    $('#connection').title = `Ответ сервера: ${date(data.server.now, true)}. Figma обновляется через ассистента.`;
  } catch {
    online = false; $('#connection').className = 'connection offline';
    $('#connection').innerHTML = '<i class="led"></i><span>Нет связи с сервисом</span>';
    if (data) render(); else $('#app').innerHTML = '<div class="empty">Сервис не отвечает.<p>Запустите npm --prefix verifier start и обновите страницу.</p></div>';
  }
}
async function post(url, body) {
  if (!online) throw new Error('Нет связи с локальным сервисом');
  const response = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json','X-Verifier-Token':data.csrf},body:JSON.stringify(body)});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Не удалось выполнить действие');
  await refresh(); return result;
}
function findings() {
  if (mode === 'run') {
    const run = currentRun();
    return (run?.findings || []).map(f => ({...f, target:f.node || f.target, targetUrl:targetUrl(f.node || f.target), sourceUrl:data.cases.find(c=>c.id===run.caseId)?.sourceUrl, capturedAt:run.capturedAt, detail:f.check === 'grid' ? `${f.name} · ${f.property}. ${f.severity === 'error' ? 'Дробные значения требуют исправления или обоснованного исключения.' : 'Целое значение вне выбранного шага сетки — предупреждение.'}` : JSON.stringify(f), rule:f.code || f.rule || 'SOURCE_FIDELITY'}));
  }
  if (board === 'lk') return data.findings;
  const b = data.boards.find(b=>b.id===board);
  if (!b) return [];
  return b.report.groups.map((g,i)=>({id:`${board}:regression:${i}`,board,severity:'info',title:`${g.name} · ${g.property}`,rule:'BOARD_CHANGE',count:g.count,actual:g.example.to,expected:g.example.from,target:g.example.target,targetUrl:targetUrl(g.example.target),sourceUrl:targetUrl(g.example.source),detail:`Изменение между досками, ${g.count} значений. Само по себе не является ошибкой: требуется оценка намерения изменения.`,capturedAt:b.capturedAt}));
}
function audit() {
  if (!data.boards.length && mode === 'archive') { if (currentRun()) mode = 'run'; else return renderEmptyArchive(); }
  const all = findings();
  const rows = all.filter(f=>(!errorsOnly || f.severity==='error') && JSON.stringify(f).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  if (!rows.some(f=>f.id===selected)) selected = rows[0]?.id;
  const item = rows.find(f=>f.id===selected), run = currentRun(), b = data.boards.find(b=>b.id===board);
  return `<div class="section-head"><div class="section-title"><span class="section-index">02</span><h2>Разобрать расхождения</h2></div><div class="section-tools"><div class="board-switch" aria-label="Источник отчёта"><button data-mode="archive" class="${mode==='archive'?'active':''}">Архив проекта</button><button data-mode="run" class="${mode==='run'?'active':''}" ${!run?'disabled':''}>Результат запуска</button></div></div></div>
    <div class="audit-toolbar"><div class="board-switch">${mode==='archive'?data.boards.map(b=>`<button data-board="${b.id}" class="${board===b.id?'active':''}">${b.name}</button>`).join(''):`<span class="subtle">${escape(run?.name)} · ${date(run?.finishedAt,true)}</span>`}</div><div class="section-tools"><label class="filter-label"><input id="errors-only" type="checkbox" ${errorsOnly?'checked':''}> Только ошибки</label><input id="search" class="search" placeholder="Найти слой или ID…" aria-label="Найти расхождение" value="${escape(search)}"></div></div>
    ${mode==='archive' ? `<div class="data-warning">Архив ${date(b.capturedAt)}. ${board==='lk' ? '35 аватаров с отклонениями геометрии. Их текущее состояние требует нового общего снимка.' : 'Изменения между досками; это журнал различий, а не список подтверждённых ошибок.'}</div>` : `<div class="rule-strip"><span>Исходник <b>${escape(run?.fidelityStatus||'—')}</b></span><span>Сетка <b>${run?.gridStep} px</b></span><span>Ошибки <b>${run?.errorCount??'—'}</b> / предупреждения <b>${run?.warningCount??'—'}</b></span><span>Данные ${run?.coverageComplete?'полные для этой проверки':'неполные — см. отчёт'}</span></div>`}
    <div class="audit-grid"><section class="panel"><div class="panel-header"><span>${mode==='run'?'Результат контрольной сверки':board==='lk'?'Несовпадения с исходником':'Изменения между досками'}</span><span class="subtle">${rows.length} / ${all.length} записей</span></div><div class="table-scroll"><table class="finding-table"><thead><tr><th class="status-cell"><span class="sr-only">Статус</span></th><th>СЛОЙ / ПРАВИЛО</th><th style="width:112px;text-align:right">${mode==='run'?'ЗНАЧЕНИЕ':board==='lk'?'МАКС. Δ':'КОЛ-ВО'}</th></tr></thead><tbody>${rows.map(f=>`<tr data-finding="${escape(f.id)}" class="${f.id===selected?'selected':''}"><td class="status-cell"><span class="${f.severity}-dot" title="${escape(f.severity)}"></span></td><td><button class="row-button" data-finding="${escape(f.id)}"><span class="issue-title">${escape(f.title)}</span><span class="node-id">${escape(f.check==='grid'?`${f.name} / ${f.property}`:f.target)}</span></button></td><td class="delta">${f.maxDelta!==undefined?`${number(f.maxDelta)} px`:f.count!==undefined?number(f.count):typeof f.actual==='number'?`${number(f.actual)} px`:'Δ'}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">Записей по этому фильтру нет.<p>Измените фильтр или выберите другой отчёт.</p></div>'}</div><div class="panel-foot"><span>Выберите строку для подробностей</span>${mode==='run'&&run?`<a href="/api/runs/${run.id}/report">Полный JSON ↓</a>`:link(b.targetUrl,'Доска Figma','')}</div></section>${detail(item)}</div>`;
}
function detail(f) {
  if (!f) return '<aside class="panel detail-panel"><span class="eyebrow">ИНСПЕКТОР</span><div class="empty">Нет выбранного расхождения.</div></aside>';
  const count = data.notes.filter(n=>n.target===f.id).length;
  return `<aside class="panel detail-panel"><div class="detail-kicker"><span class="eyebrow">ИНСПЕКТОР СЛОЯ</span><span class="tag ${f.severity==='info'?'muted':''}">${f.severity==='error'?'ОШИБКА':f.severity==='warning'?'ПРЕДУПРЕЖДЕНИЕ':'ИЗМЕНЕНИЕ'}</span></div><h3>${escape(f.title)}</h3><p>${escape(f.detail)}</p>
    <div class="measurement"><div><label>${f.maxDelta!==undefined?'МАКС. ОТКЛОНЕНИЕ':'В МАКЕТЕ'}</label><strong class="actual">${typeof (f.maxDelta??f.actual)==='number'?number(f.maxDelta??f.actual):'Δ'}</strong><span class="unit">${typeof (f.maxDelta??f.actual)==='number'?'px':'изменение'}</span></div><div><label>${f.check==='grid'?'БЛИЖАЙШЕЕ ЦЕЛОЕ':f.expected!==undefined?'В ИСХОДНИКЕ':'ПРАВИЛО'}</label><strong>${f.check==='grid'?number(f.nearestWholePx):typeof f.expected==='number'?number(f.expected):'по k'}</strong>${f.check==='grid'?'<span class="unit">px · ориентир</span>':''}</div></div>
    ${f.check==='grid'?`<div class="detail-context">Шаг ${currentRun()?.gridStep} px → ближайшее значение ${number(f.nearestGridPx)} px. Округление здесь — подсказка; изменение требует проверки композиции.</div>`:''}
    <div class="detail-meta">${escape(f.rule)}<br>Снимок: ${date(f.capturedAt,true)}<br>Узел: ${escape(f.target)}<br>Пометок: ${count}</div><div class="detail-actions">${link(f.targetUrl,'Открыть слой','button')}${link(f.sourceUrl,'Исходник','button quiet')}<button class="button quiet" data-action="annotate">Пометить</button></div></aside>`;
}
function comparison() {
  if (!data.legacyPokerArchive) return '<section class="panel empty">Скриншоты появятся в ревизиях после импорта.<p>Каждому изображению нужен точный узел Figma, дата и отчёт проверки.</p></section>';
  return `<section class="panel"><div class="panel-header"><span>Визуальное сравнение</span><span class="subtle">АРХИВ · 08.09.2026</span></div><div class="comparison"><div class="comparison-header"><h3>Личный кабинет / Коллекция</h3><span>390 × 844</span></div><div class="photo-comparison" style="--split:${split}%"><img src="/evidence/lk-before.png" alt="Экран коллекции до изменения" loading="lazy"><img class="after" src="/evidence/lk-after.png" alt="Тот же экран после изменения" loading="lazy"><div class="comparison-divider"></div><div class="photo-captions"><span>ПОСЛЕ</span><span>ДО</span></div></div><input id="compare-range" class="compare-range" type="range" min="0" max="100" value="${split}" aria-label="Граница сравнения до и после"><div class="comparison-footer"><span>Передвиньте границу сравнения</span>${link('/evidence/lk-source.png','Исходная панель')}</div><p class="comparison-note">Сохранённый экран целиком, независимо от выбранной строки. Сравнение помогает оценить изменение глазами; соответствие размеров подтверждает числовой отчёт.</p></div></section>`;
}
function logPanel() {
  return `<section class="panel"><div class="panel-header"><span>Журнал работы</span><span class="subtle">РЕАЛЬНЫЕ СОБЫТИЯ</span></div><div class="log">${data.events.slice(0,5).map(e=>`<article class="log-item ${escape(e.kind)}"><div class="log-top"><strong>${escape(e.title)}</strong><time datetime="${escape(e.at)}">${date(e.at,true)}</time></div><p>${escape(e.detail)}</p></article>`).join('')}</div></section>`;
}
function noteCard(n) { return `<article class="note-card"><div class="note-head"><span class="note-kind">${escape(kinds[n.kind])} / ${escape(n.author)}</span><time datetime="${escape(n.at)}">${date(n.at,true)}</time></div><p>${escape(n.text)}</p><div class="note-target">${n.target==='project'?'Весь проект':`Привязка: ${escape(n.target)}`}</div></article>`; }
function noteForm() {
  return `<form id="note-form" class="notes-form"><div class="form-row"><label>ТИП ПОМЕТКИ<select id="note-kind">${Object.entries(kinds).map(([k,v])=>`<option value="${k}" ${draft.kind===k?'selected':''}>${v}</option>`).join('')}</select></label><label>ПРИВЯЗКА<select id="note-target"><option value="project">Весь проект</option>${draft.target!=='project'?`<option value="${escape(draft.target)}" selected>Выбранное расхождение</option>`:''}</select></label></div><textarea id="note-text" maxlength="4000" required placeholder="Что нужно проверить, уточнить или сохранить…" aria-label="Текст пометки">${escape(draft.text)}</textarea><div class="form-actions"><span>Пометка не снимает ошибку проверки.</span><button class="button primary" type="submit" ${!online?'disabled':''}>Сохранить</button></div></form>`;
}
function runsPage() {
  return `<div class="intro-row"><div><span class="eyebrow">ИСПОЛНЕННЫЕ ПРОВЕРКИ / ЛОКАЛЬНЫЙ ДВИЖОК</span><h2>История проверок</h2><p>Дата снимка, параметры, контрольные суммы и полный отчёт сохраняются вместе.</p></div><button class="button primary" data-action="run" ${data.server.activeRun||busy||!online||!data.cases.length?'disabled':''}>Запустить · ${grid} px</button></div><div class="run-list">${data.runs.map(r=>`<article class="run-card"><div class="run-card-header"><div><h3>${escape(r.name)}</h3><div class="run-meta">${date(r.startedAt,true)} · ${r.durationMs!==undefined?`${(r.durationMs/1000).toFixed(2)} с`:'выполняется'} · ${escape(r.id)}</div></div>${badge(r.status)}</div><div class="run-stats"><div class="run-stat"><label>СНИМОК FIGMA</label><strong>${date(r.capturedAt,true)}</strong></div><div class="run-stat"><label>ИСХОДНИК</label><strong>${escape(r.fidelityStatus||'—')}</strong></div><div class="run-stat"><label>ПИКСЕЛЬНАЯ СЕТКА</label><strong>${r.gridStep} px / ${escape(r.pixelStatus||'—')}</strong></div><div class="run-stat"><label>ОШИБКИ / ПРЕДУПРЕЖДЕНИЯ</label><strong>${r.errorCount??'—'} / ${r.warningCount??'—'}</strong></div></div><p class="run-fineprint">${escape(r.scope)} ${r.includeArtwork?'Геометрия графики включена.':'Геометрия графики исключена из проверки сетки.'}</p><p class="run-fineprint">${r.coverageComplete?'Покрытие свойств в рамках проверки полное.':r.status==='RUNNING'?'Проверка ещё выполняется.':'Данные проверки неполны либо запуск завершился ошибкой.'} ${r.roundingCount?`Допуск сериализации Figma: ${r.roundingCount} значений.`:''}</p>${r.error?`<p class="data-warning">${escape(r.error)}</p>`:''}<details><summary class="subtle">Контрольные суммы снимков · SHA-256</summary><p class="code-line">Исходник ${escape(r.sourceHash)}</p><p class="code-line">Макет ${escape(r.targetHash)}</p></details>${r.findings?`<div class="run-cta"><button class="text-link inline-button" data-run="${r.id}">Разобрать результат →</button><a class="text-link" href="/api/runs/${r.id}/report">Скачать отчёт JSON ↓</a></div>`:''}</article>`).join('')||'<div class="panel empty">Запусков пока нет. Выполните первую проверку с пульта.</div>'}</div>`;
}
function render() {
  if (!data) return;
  const focus = document.activeElement?.id, caret = focus==='search'||focus==='note-text' ? document.activeElement.selectionStart : null;
  const tableScroll = $('.table-scroll')?.scrollTop || 0;
  $('[data-view="'+view+'"]').classList.add('active');
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
  const activeNav=document.querySelector('.navigation [data-view='+view+']');
  document.querySelector('.mobile-current').textContent=Array.from(activeNav.childNodes).filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(' ').trim();
  $('#nav-count').textContent = data.findings.length;
  $('#nav-count').title = data.legacyPokerArchive ? 'Архив: аватары с отклонениями геометрии' : 'Сохранённые расхождения выбранного проекта';
  let content;
  if (view==='overview') content = renderDashboard(data, knowledge, {online,busy,grid,artwork});
  if (view==='findings') content = '<div class="intro-row"><div><span class="eyebrow">РЕЕСТР / РАЗЛИЧИЯ И ПРАВИЛА</span><h2>От общего статуса к конкретному слою.</h2></div></div>'+audit();
  if (view==='runs') content = runsPage();
  if (view==='audits') content = renderDesignAudits(data.audits, auditDetail, selectedAudit);
  if (view==='knowledge') content = renderKnowledge(knowledge, knowledgeError);
  if (view==='screen-map') content = renderScreenMap(screenMapReference, screenMapError, screenMapMode, chessMapSelected, chessMapVariant, data.profileId);
  if (view==='notes') content = `<div class="intro-row"><div><span class="eyebrow">РАБОЧИЙ ЖУРНАЛ / РЕШЕНИЯ</span><h2>Что проверили. Что решили. Что дальше.</h2><p>Ваши пометки и отчёты ассистента сохраняются на этом компьютере.</p></div></div><div class="two-column"><section class="panel"><div class="panel-header"><span>Новая пометка</span><span class="subtle">${draft.target==='project'?'ПРОЕКТ':'КОНКРЕТНОЕ РАСХОЖДЕНИЕ'}</span></div>${noteForm()}</section><section class="panel"><div class="panel-header"><span>Записи</span><span class="subtle">${data.notes.length}</span></div>${data.notes.map(noteCard).join('')||'<div class="empty">Пометок пока нет.</div>'}</section></div>`;
  const pending = data.requests.filter(r=>r.status==='WAITING');
  const requestNotice = pending.length ? `<div class="pending-strip"><span><i class="led"></i> Запрос на обновление ожидает ассистента · ${pending.length}</span><span>Напишите в чате: «Верификатор: обнови снимки».</span></div>` : '';
  $('#app').innerHTML = (!online?'<div class="data-warning">Связь потеряна. Показан последний полученный ответ; действия недоступны до восстановления связи.</div>':'')+requestNotice+content;
  if ($('.table-scroll')) $('.table-scroll').scrollTop = tableScroll;
  if (focus && document.getElementById(focus)) { document.getElementById(focus).focus({preventScroll:true}); if(caret!==null) document.getElementById(focus).setSelectionRange(caret,caret); }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button,[data-finding]'); if(!button||button.disabled)return;
  const d = button.dataset;
  try {
    if (d.action==='menu') { const open=document.body.classList.toggle('nav-open'); button.setAttribute('aria-expanded',String(open)); document.querySelector('#app').inert=open; document.querySelector('.site-footer').inert=open; if(open) document.querySelector('.navigation .active').focus(); return; }
    if (d.view) { closeNavigation(); if(window.matchMedia('(max-width:760px)').matches) document.querySelector('#app').focus({preventScroll:true}); }
    if (d.view) { view=d.view; if (view !== 'audits') history.replaceState(null, '', location.pathname); render(); window.scrollTo({top:0,behavior:'instant'}); }
    if (d.view === 'audits') {
      if (selectedAudit || data.audits?.[0]) await openAudit(selectedAudit || data.audits[0].id);
      else history.replaceState(null, '', location.pathname);
    }
    if (d.view === 'knowledge') await openKnowledge();
    if (d.view === 'screen-map' || d.action === 'retry-screen-map') await openScreenMap();
    if (d.mapMode && ['mobile','desktop'].includes(d.mapMode)) { screenMapMode=d.mapMode; render(); }
    if (d.chessScreen && screenMapReference?.screens?.some(screen => screen.id === d.chessScreen)) { chessMapSelected=d.chessScreen;chessMapVariant='a';render(); }
    if (d.chessVariant && screenMapReference?.screens?.find(screen => screen.id === chessMapSelected)?.variants?.some(variant => variant.id === d.chessVariant)) { chessMapVariant=d.chessVariant;render(); }
    if (d.audit) { await openAudit(d.audit); window.scrollTo(0,0); }
    if (d.board) { board=d.board;selected=null;render(); }
    if (d.mode) { mode=d.mode;selected=null;render(); }
    if (d.finding) { selected=d.finding;render(); }
    if (d.grid) { grid=Number(d.grid);render(); }
    if (d.run) { selectedRun=d.run;mode='run';view='findings';selected=null;render();window.scrollTo(0,0); }
    if (d.close) document.getElementById(d.close).close();
    if (d.action==='rotate-grid') {grid={2:4,4:8,8:2}[grid];render();}
    if (d.action==='artwork') {artwork=!artwork;render();}
    if (d.action==='capture') $('#capture-dialog').showModal();
    if (d.action==='latest') { selectedRun=latest()?.id;mode='run';view='findings';selected=null;render();window.scrollTo(0,0); }
    if (d.action==='annotate') { draft.target=selected;view='notes';render();window.scrollTo(0,0);$('#note-text').focus(); }
    if (d.action==='run') {
      if (!data.cases.length) throw new Error('Сначала настройте проверяемый компонент');
      busy=true;render();const run=await post('/api/runs',{caseId:data.cases[0].id,gridStep:grid,includeArtwork:artwork});
      selectedRun=run.id;notify('Движок запущен. Отчёт появится в истории.');
    }
    if (button.id==='request-capture') {
      if (!data.cases.length) throw new Error('Сначала настройте проверяемый компонент');
      const request=await post('/api/requests',{caseId:data.cases[0].id});
      $('#request-result').textContent=`Запрос ${request.id} сохранён.\nНапишите в чате: «Верификатор: выполни запрос на обновление снимков».\nСтатус: ожидает ассистента.`;
    }
  } catch(error) {notify(error.message);} finally { if(busy){busy=false;render();} }
});
document.addEventListener('input', event => {
  const e=event.target;
  if(e.id==='search'){search=e.value;render();}
  if(e.id==='compare-range'){split=Number(e.value);$('.photo-comparison').style.setProperty('--split',`${split}%`);}
  if(e.id==='note-text')draft.text=e.value;
});
document.addEventListener('change', event => {
  const e=event.target;
  if(e.id==='errors-only'){errorsOnly=e.checked;render();}
  if(e.id==='note-kind')draft.kind=e.value;
  if(e.id==='note-target')draft.target=e.value;
});
document.addEventListener('submit', async event => {
  if(event.target.id!=='note-form')return;event.preventDefault();
  const button=event.target.querySelector('button[type=submit]');button.disabled=true;
  try { await post('/api/notes',{...draft});draft={text:'',kind:'note',target:'project'};render();notify('Пометка сохранена.'); }
  catch(error){notify(error.message);button.disabled=false;}
});
await refresh();
if (data) { try { const response = await fetch('/api/context'); if(response.ok) knowledge = await response.json(); } catch {} render(); }
const linkedAudit = new URL(location.href).searchParams.get('audit');
if (linkedAudit && data?.audits?.some(a => a.id === linkedAudit)) await openAudit(linkedAudit);
else if (data && new URL(location.href).searchParams.get('view') === 'screen-map') await openScreenMap();
setInterval(()=>refresh(),2000);

document.addEventListener('keydown', event => {
  if(!document.body.classList.contains('nav-open')) return;
  if(event.key==='Escape') { closeNavigation(); document.querySelector('[data-action=menu]').focus(); return; }
  if(event.key==='Tab') {
    const items=[document.querySelector('[data-action=menu]'),...document.querySelectorAll('.navigation button:not(:disabled)')];
    const index=items.indexOf(document.activeElement);
    if(event.shiftKey && index<=0) {event.preventDefault();items.at(-1).focus();}
    else if(!event.shiftKey && (index===items.length-1 || index<0)) {event.preventDefault();items[0].focus();}
  }
});
window.matchMedia('(max-width:760px)').addEventListener('change', event=>{if(!event.matches)closeNavigation();});
