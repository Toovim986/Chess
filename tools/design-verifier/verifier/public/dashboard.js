import { renderProfileRack } from './profile-view.js';
import { renderAuditOverview } from './design-audits.js';
import { renderViewportReview } from './viewport-review.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => value ? new Date(value).toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'}) : 'Дата не указана';
const icon = name => `<span class="icon" style="--icon:url('/assets/phosphor/${name}.svg')" aria-hidden="true"></span>`;
const status = value => `<span class="tag" data-status="${esc(value)}">${esc(value)}</span>`;
const fields = [
  ['designSystem','Подключить библиотеку','Компоненты и точный источник дизайн-системы в Figma.'],
  ['productContract','Описать сценарии игры','Состояния, действия и переходы для первого экрана.'],
  ['compositionContract','Согласовать композицию','Структура и поведение мобильного экрана.'],
  ['destination','Выбрать место сдачи','Файл и страница Figma для готовых макетов.'],
  ['viewportPolicy','Определить размеры','Контрольные размеры и ограничения доступной области.']
];

function preparation(context) {
  if (!context) return '<div class="panel loading"><span class="skeleton skeleton-title"></span><span class="skeleton"></span>Загружаю состояние проекта…</div>';
  const gaps = new Set(context.preflight.gaps.map(g => g.field));
  const complete = fields.filter(([field]) => !gaps.has(field)).length;
  return `<section class="panel"><div class="panel-header"><span>Подготовка проекта</span><span class="subtle">${String(complete).padStart(2,'0')} / 05</span></div><div class="panel-body"><div class="checklist-heading"><h3>Основа для первого макета</h3>${icon('circle-dashed')}</div><div class="progress-track" role="progressbar" aria-label="Шаги подготовки проекта" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${complete}"><span style="width:${complete * 20}%"></span></div><p class="progress-caption">${complete} из 5 шагов подготовки выполнено. Это ещё не оценка дизайна.</p><ol class="setup-list">${fields.map(([field,title,description],i) => `<li class="setup-step ${gaps.has(field)?'':'complete'}"><span class="step-marker">${gaps.has(field)?String(i+1).padStart(2,'0'):icon('check')}</span><div><strong>${title}</strong><p>${description}</p></div><span class="step-state">${gaps.has(field)?'Нужно решение':'Подключено'}</span></li>`).join('')}</ol><div class="panel-bottom-action"><button class="text-link inline-button" data-view="knowledge">Источники и требования ${icon('arrow-right')}</button><p>Условия проверки и открытые вопросы проекта.</p></div></div></section>`;
}

function sourcePreview(context) {
  const source = context?.profile.designSystem;
  return `<section class="panel source-preview"><div class="source-icon">${icon('book-open')}</div><span class="eyebrow">Общий источник</span><h3>Библиотека компонентов</h3><p>${source?'Компоненты и визуальные основы для следующих игровых интерфейсов.':'Подключите библиотеку, чтобы зафиксировать компоненты и правила применения.'}</p>${source?`<div class="source-location"><strong>Figma · Poker Library</strong><span>Узел ${esc(source.nodeId)} · ${esc(source.revision)}</span></div><a class="text-link" href="https://www.figma.com/design/${encodeURIComponent(source.fileKey)}/?node-id=${encodeURIComponent(source.nodeId)}" target="_blank" rel="noopener noreferrer">Открыть библиотеку ${icon('arrow-up-right')}</a><p class="subtle" style="margin-top:16px">Доступность источника подтверждена. Применение к экрану проверяется отдельно.</p>`:`<button class="text-link inline-button" data-view="knowledge">Посмотреть требования ${icon('arrow-right')}</button>`}</section>`;
}

function latestRun(data) {
  const run = data.runs.find(r => r.status !== 'RUNNING');
  if (!run) return '';
  return `<section class="panel"><div class="panel-header"><span>Последняя проверка</span>${status(run.status)}</div><div class="panel-body"><h3>${esc(run.name)}</h3><p class="run-fineprint">Снимок ${date(run.capturedAt)} · результат сохранён отдельно от импортированных отчётов.</p><div class="run-stats"><div class="run-stat"><label>Исходник</label><strong>${esc(run.fidelityStatus || '—')}</strong></div><div class="run-stat"><label>Сетка</label><strong>${esc(run.pixelStatus || '—')}</strong></div></div><button class="text-link inline-button" data-run="${esc(run.id)}">Разобрать результат ${icon('arrow-right')}</button></div></section>`;
}

export function renderDashboard(data, context, controls) {
  const profileName = context?.profile.name || data.project;
  const source = context?.profile.designSystem;
  const gaps = context?.preflight.gaps.length;
  const metric = (title,value,caption,small=false) => `<div class="metric"><dt>${title}</dt><dd${small?' class="small"':''}>${value}</dd><p>${caption}</p></div>`;
  const events = data.events.slice(0,3);
  return `<header class="page-head"><div><span class="eyebrow">Рабочее пространство / ${data.profileId==='chess'?'Mobile First':'История и проверка'}</span><h2 class="page-title">${esc(profileName)}</h2><p>${data.legacyPokerArchive?'Макеты, проверки и решения. История сохраняет исходные результаты.':'От общих правил к первому проверенному экрану.'}</p></div><div class="page-aside">${status(context?.preflight.status || 'INCOMPLETE')}<p>Готовность к следующему этапу</p><button class="button primary" data-view="knowledge" style="margin-top:16px">Открыть правила ${icon('arrow-right')}</button></div></header>
    <dl class="metric-strip" aria-label="Состояние проекта">${metric('Дизайн-система',source?'<span class="inline-dot"></span>Подключена':'Не назначена',source?'Источник Figma зафиксирован':'Требуется источник',true)}${metric('Активные правила',context?.activeRules.length ?? '—','Общий процесс проверки')}${metric('Ревизии макетов',data.audits.length,data.audits.length?'Сохранённые пакеты доказательств':'Первый пакет ещё не импортирован')}${metric('Открытые вопросы',gaps ?? '—','До подготовки первого экрана')}</dl>
    <div class="dashboard-grid"><div>${data.legacyPokerArchive?`${renderAuditOverview(data.audits)}${latestRun(data)}<section class="panel"><div class="panel-header"><span>Архив сопоставлений</span><span class="subtle">${date(data.avatar.capturedAt)}</span></div><div class="panel-body"><h3>${data.boards.reduce((n,b)=>n+b.report.visibleScreens,0)} экранов · ${data.findings.length} замечаний</h3><p class="run-fineprint">Сохранённое сравнение источников. Эти данные не заменяют новую проверку текущих макетов.</p><button class="text-link inline-button" data-view="findings" style="margin-top:24px">Открыть расхождения ${icon('arrow-right')}</button></div></section>`:preparation(context)}</div><aside class="dashboard-sidebar">${sourcePreview(context)}${renderProfileRack(data,controls)}</aside></div>
    ${data.legacyPokerArchive?renderViewportReview(data.viewportReview,data.targetFile):`<section class="panel viewport-review" data-viewport-status="${esc(data.viewportReview.result.status)}"><div class="viewport-heading"><div><span class="eyebrow">Доступность контента</span><h2>Размеры и среда исполнения</h2></div>${status(data.viewportReview.result.status)}</div><p class="run-fineprint">Контракт размеров ещё не подключён. Геометрия Figma, доступная область браузера и системные отступы проверяются отдельно.</p></section>`}
    <div class="dashboard-bottom"><section class="panel"><div class="panel-header"><span>Последние события</span><span class="subtle">Журнал проекта</span></div><div class="log">${events.map(e=>`<article class="log-item"><div class="log-top"><strong>${esc(e.title)}</strong><time datetime="${esc(e.at)}">${date(e.at)}</time></div>${e.detail?`<p>${esc(e.detail)}</p>`:''}</article>`).join('')}</div></section><section class="panel"><div class="panel-header"><span>Решения и заметки</span><button class="text-link inline-button" data-view="notes">Открыть ${icon('arrow-up-right')}</button></div>${data.notes[0]?`<div class="dashboard-note"><span class="tag">${esc(data.notes[0].kind==='decision'?'Решение':'Пометка')}</span><p>${esc(data.notes[0].text)}</p><span class="subtle">${date(data.notes[0].at)}</span></div>`:`<div class="empty-state">${icon('note-pencil')}<h3>Сохраните первое решение</h3><p>Договорённости и вопросы остаются рядом с проверками, чтобы к ним можно было вернуться.</p><button class="text-link inline-button" data-view="notes">Добавить пометку ${icon('arrow-right')}</button></div>`}</section></div>`;
}
