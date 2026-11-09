// Compact chess workspace: pictures first, words only where a decision is needed.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => value ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const tag = status => `<span class="tag" data-status="${escape(status)}">${escape(status)}</span>`;
const asset = (auditId, artifactId) => `/api/audits/${encodeURIComponent(auditId)}/artifacts/${encodeURIComponent(artifactId)}`;
const figma = (fileKey, nodeId) => `https://www.figma.com/design/${encodeURIComponent(fileKey)}/?node-id=${encodeURIComponent(nodeId)}`;
const external = (url, text, cls = 'text-link') => `<a class="${cls}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${text} ↗</a>`;
const preview = name => `/chess/ds/${name}.png`;
const loading = text => `<div class="panel empty" role="status">${escape(text)}</div>`;

const PREVIEWS = {
  CustomizedAvatar: ['avatar-badge'], 'badge no level': ['avatar-badge'], progressbar: ['level-progress', 'tasks-progress'],
  tab: ['tabs-mode', 'game-moves'], Button: ['button-cta', 'game-actions'], 'icon Button': ['stats', 'game-actions'], labels: ['task-card', 'labels-bonus'], cell: ['cell-row'], 'timer new': ['game-player'],
};
const LOCAL_PREVIEWS = { 'chess/MobileHeader': 'header', 'chess/BottomNav': 'nav', 'chess/Board': 'game-board', '⚠ GAP · chess/piece': 'game-board', '⚠ GAP · chess/currency/pawn': 'pawn' };
const GAP_PREVIEWS = { 'GAP-PAWN': 'pawn', 'GAP-LEAGUE-EMBLEM': 'league-card', 'GAP-NAV-ICONS': 'nav', 'GAP-CTA-SIZE': 'button-cta', 'GAP-TYPE-40': 'result-modal', 'GAP-DIFFICULTY': 'task-card', 'GAP-PIECES': 'game-board', 'GAP-BOARD': 'game-board', 'GAP-GAME-ACTIONS': 'game-actions' };

// Revision items grouped by artifact role; concept revisions have only "concept" images.
export function revisionItems(revision, role) {
  if (!revision) return [];
  const roles = new Map(revision.artifacts.map(a => [a.id, a.role]));
  return revision.screens.filter(s => !role || roles.get(s.screenshotArtifact) === role)
    .map(s => ({ ...s, src: asset(revision.id, s.screenshotArtifact), figma: revision.kind === 'concept' ? '' : figma(revision.target.fileKey, s.id) }));
}
const shortName = name => name.replace(/^Карта передачи · /, '').replace(/^Обзор · /, '').split(' / ')[0];
const portrait = item => item.height / item.width > 1.5;
const thumb = (item, group, { caption = item.name, label = shortName(item.name) } = {}) => `<button class="cw-thumb" data-lightbox="${group}" data-src="${escape(item.src)}" data-caption="${escape(caption)}" data-fit="${portrait(item) ? 'height' : 'width'}"><img src="${escape(item.src)}" alt="${escape(caption)}" loading="lazy" width="${item.width}" height="${item.height}"><span>${escape(label)}</span></button>`;

function sources(ds) {
  const s = ds?.sources; if (!s) return [];
  return [
    ['Шахматы · скриншоты', figma(s.destination.fileKey, s.destination.pages.screenshots)],
    ['♦️ Poker lib', figma(s.designSystem.fileKey, s.designSystem.colorsPage)],
    ['ГДД шахмат', `https://docs.google.com/document/d/${encodeURIComponent(s.gdd.documentId)}/edit`],
    ['Эталон передачи', figma(s.handoffReference.fileKey, s.handoffReference.pages.map)],
    ['Сборка из DS', figma(s.build.fileKey, s.build.pages.screens)],
  ];
}

export function renderChessHome(revision, ds) {
  if (!revision) return loading('Загружаю последнюю ревизию…');
  const screens = revisionItems(revision, 'screen');
  const instances = ds ? ds.screens.reduce((n, s) => n + s.pokerLibInstances, 0) : '—';
  const raw = ds ? ds.screens.reduce((n, s) => n + s.rawPaints, 0) + ds.localComponents.reduce((n, c) => n + c.rawPaints, 0) : '—';
  const gaps = ds ? ds.gaps.filter(g => g.type === 'DESIGN_GAP').length : '—';
  const open = revision.findings.filter(f => f.status === 'OPEN');
  const links = sources(ds);
  const kpi = (value, label, view) => `<button class="cw-kpi" data-view="${view}"><strong>${value}</strong><span>${label}</span></button>`;
  return `<header class="cw-head"><div><span class="eyebrow">Шахматы · Mobile</span><h2>Экраны</h2><p>${date(revision.capturedAt)}</p></div><div class="cw-head-actions">${tag(revision.status)}${links[0] ? external(links[0][1], 'Открыть в Figma', 'button primary') : ''}</div></header>
    <div class="cw-strip">${screens.map(s => thumb(s, 'home')).join('')}</div>
    <div class="cw-kpis">${kpi(screens.length, 'экранов', 'audits')}${kpi(instances, 'экземпляров Poker lib', 'ds')}${kpi(raw, 'цветов вне DS', 'ds')}${kpi(gaps, 'пробелов DS', 'ds')}</div>
    <div class="cw-columns"><section class="panel"><div class="panel-header"><span>Решить</span><span class="subtle">${open.length}</span></div><ul class="cw-todo">${open.map(f => `<li><i class="cw-dot ${escape(f.severity)}"></i>${escape(f.title)}</li>`).join('')}</ul></section>
    <section class="panel"><div class="panel-header"><span>Источники</span></div><div class="cw-links">${links.map(([label, url]) => external(url, escape(label))).join('')}</div></section></div>`;
}

export function renderChessMockups(audits, detail, selectedId, tab, manifests) {
  if (!audits.length) return loading('Ревизии ещё не импортированы.');
  if (!detail || detail.id !== selectedId) return loading('Загружаю макеты…');
  const concept = detail.kind === 'concept';
  // Experimental collections live in the lab tab of a revision instead of the archive.
  const lab = concept ? [] : audits.filter(a => a.kind === 'concept' && manifests[a.id]).map(a => manifests[a.id]);
  const firstCollectionId = 'audit-1793099238237-5e166a';
  const earlyIds = new Set(['audit-1793101230391-7b15ae', 'audit-1793099238121-d4efd6']);
  const collections = lab.filter(m => !earlyIds.has(m.id)).map(m => ({ ...m, collectionTitle: m.id === firstCollectionId ? 'Коллекция 1 · первые решения' : m.title }))
    .sort((a, b) => Number(a.collectionTitle.match(/^Коллекция\s+(\d+)/)?.[1] || 999) - Number(b.collectionTitle.match(/^Коллекция\s+(\d+)/)?.[1] || 999));
  const early = lab.filter(m => earlyIds.has(m.id));
  const groups = concept ? [['all', 'Концепты', revisionItems(detail)]] : [['screens', 'Экраны', revisionItems(detail, 'screen')], ['maps', 'Карты передачи', revisionItems(detail, 'screen-map')], ['overview', 'Обзор', revisionItems(detail, 'overview')], ['lab', 'Экспериментариум', lab.flatMap(m => revisionItems(m))]].filter(g => g[2].length);
  const current = groups.find(g => g[0] === tab) || groups[0];
  const archive = audits.filter(a => a.id !== detail.id && !lab.some(m => m.id === a.id));
  const collectionUrl = m => `?audit=${encodeURIComponent(detail.id)}&mockTab=lab#collection-${encodeURIComponent(m.id)}`;
  const earlyGallery = early.length ? `<details class="cw-details cw-lab-early"><summary>Ранние пробы</summary>${early.map(m => `<article class="cw-lab-early-item" data-early-audit="${escape(m.id)}"><h4>${escape(m.title)}</h4><div class="cw-gallery wide">${revisionItems(m).map(item => thumb(item, `early-${m.id}`, { caption: `${m.title} · ${item.name}`, label: item.name })).join('')}</div></article>`).join('')}</details>` : '';
  const labSection = m => {
    const items = revisionItems(m);
    return `<section class="cw-lab" id="collection-${escape(m.id)}" aria-labelledby="collection-heading-${escape(m.id)}"><div class="cw-lab-heading"><div><h3 id="collection-heading-${escape(m.id)}">${escape(m.collectionTitle)}</h3><span class="subtle">${date(m.capturedAt)} · ${items.length} изображений</span></div><button class="button quiet" data-copy-collection="${escape(collectionUrl(m))}">Копировать ссылку</button></div><div class="cw-gallery ${items.every(portrait) ? 'portrait' : 'wide'}">${items.map(item => thumb(item, `lab-${m.id}`, { caption: `${m.collectionTitle} · ${item.name}`, label: item.name })).join('')}</div>${m.id === firstCollectionId ? earlyGallery : ''}</section>`;
  };
  const collectionNavigation = `<nav class="cw-collection-nav" aria-label="Коллекции экспериментариума">${collections.map(m => `<a href="${escape(collectionUrl(m))}"><strong>${escape(m.collectionTitle)}</strong><span>${revisionItems(m).length} изображений</span></a>`).join('')}</nav>`;
  const gallery = current[0] === 'lab'
    ? `${collectionNavigation}${collections.map(labSection).join('')}${collections.some(m => m.id === firstCollectionId) ? '' : earlyGallery}`
    : `<div class="cw-gallery ${current[0] === 'screens' ? 'portrait' : 'wide'}">${current[2].map(item => thumb(item, 'mock')).join('')}</div>`;
  const archiveCard = a => { const m = manifests[a.id]; const first = m && revisionItems(m)[0]; return `<button class="cw-archive-item" data-audit="${escape(a.id)}">${first ? `<img src="${escape(first.src)}" alt="" loading="lazy">` : '<span class="cw-archive-blank"></span>'}<strong>${escape(a.title)}</strong><span>${a.kind === 'concept' ? 'концепт' : 'ревизия'} · ${date(a.capturedAt)}</span></button>`; };
  return `<header class="cw-head"><div><span class="eyebrow">${concept ? 'Концепт' : 'Ревизия'} · ${date(detail.capturedAt)}</span><h2>${escape(detail.title)}</h2></div><div class="cw-head-actions">${tag(detail.status)}${concept ? '' : external(figma(detail.target.fileKey, detail.target.pageId), 'Сборка в Figma', 'button quiet')}</div></header>
    ${concept ? `<div class="data-warning">${escape(detail.summary || 'Экспериментальные варианты для обсуждения. Источники и ограничения — в отчёте коллекции.')}</div>` : ''}
    <div class="cw-segments" role="tablist">${groups.map(([id, label, items]) => `<button role="tab" aria-selected="${id === current[0]}" class="${id === current[0] ? 'active' : ''}" data-mock-tab="${id}">${label}<span>${items.length}</span></button>`).join('')}</div>
    ${gallery}
    <div class="cw-checks">${detail.checks.map(c => `<span class="cw-check" title="${escape(c.summary)}">${escape(c.name)} ${tag(c.status)}</span>`).join('')}</div>
    ${detail.findings.length ? `<details class="cw-details"><summary>Замечания · ${detail.findings.filter(f => f.status === 'OPEN').length} открыто, ${detail.findings.filter(f => f.status !== 'OPEN').length} закрыто</summary><ul class="cw-todo">${detail.findings.map(f => `<li><i class="cw-dot ${f.status === 'OPEN' ? escape(f.severity) : 'done'}"></i>${escape(f.title)}<span class="subtle">${escape(f.status)}</span></li>`).join('')}</ul></details>` : ''}
    ${archive.length ? `<details class="cw-details"><summary>Архив ревизий · ${archive.length}</summary><div class="cw-archive">${archive.map(archiveCard).join('')}</div></details>` : ''}`;
}

export function renderChessMap(revision, selectedId) {
  if (!revision) return loading('Загружаю карты передачи…');
  const maps = revisionItems(revision, 'screen-map');
  if (!maps.length) return loading('В последней ревизии нет карт передачи.');
  const map = maps.find(m => m.id === selectedId) || maps[0];
  const json = revision.artifacts.find(a => a.id === 'handoff-map');
  return `<header class="cw-head"><div><span class="eyebrow">Передача во фронт</span><h2>Карта передачи</h2></div><div class="cw-head-actions">${json ? `<a class="button quiet" href="${asset(revision.id, json.id)}" download="handoff-map.json">JSON ↓</a>` : ''}${external(map.figma, 'Узел в Figma', 'button quiet')}</div></header>
    <div class="cw-map-layout"><nav class="cw-map-rail" aria-label="Карты экранов">${maps.map(m => `<button class="${m.id === map.id ? 'active' : ''}" data-chess-map="${escape(m.id)}" aria-pressed="${m.id === map.id}"><img src="${escape(m.src)}" alt="" loading="lazy"><span>${escape(shortName(m.name))}</span></button>`).join('')}</nav>
    <figure class="cw-map-main"><button class="cw-map-image" data-lightbox="map" data-src="${escape(map.src)}" data-caption="${escape(map.name)}" data-fit="width"><img src="${escape(map.src)}" alt="${escape(map.name)}" width="${map.width}" height="${map.height}"></button></figure></div>`;
}

export function renderChessRefs(refs, revision) {
  if (!refs) return loading('Загружаю референсы…');
  const ours = revisionItems(revision, 'screen').find(s => s.name.includes('Партия'));
  const card = (item, { app, take, source, ours: own } = {}) => `<figure class="cw-ref ${own ? 'ours' : ''}">${thumb(item, 'refs', { caption: item.name, label: app })}<figcaption>${take ? `<span>${escape(take)}</span>` : ''}${source ? external(source, 'App Store') : ''}</figcaption></figure>`;
  const refItem = it => card({ src: `/chess/references/${encodeURIComponent(it.file)}`, name: `${it.app} · ${it.title}`, width: 600, height: 1300 }, it);
  const gallery = group => `<section class="cw-section"><h3 class="cw-section-title">${escape(group.title)} <span>${group.items.length}</span></h3><div class="cw-gallery portrait">${group.id === 'game' && ours ? card(ours, { app: 'VKChess · наш экран', take: 'Собран из Poker lib по выводам ниже', ours: true }) : ''}${group.items.map(refItem).join('')}</div></section>`;
  return `<header class="cw-head"><div><span class="eyebrow">Исследование · ${date(refs.collectedAt)}</span><h2>Референсы</h2><p>${escape(refs.topic)}</p></div></header>
    ${gallery(refs.groups[0])}
    <section class="cw-section"><h3 class="cw-section-title">Что взяли в экран партии <span>${refs.patterns.length}</span></h3><div class="cw-patterns">${refs.patterns.map(p => `<div class="cw-pattern"><strong>${escape(p.title)}</strong><div class="cw-chips">${p.apps.map(a => `<span>${escape(a)}</span>`).join('')}</div><span class="cw-applied">${escape(p.applied)}</span></div>`).join('')}</div>
    ${refs.notTaken?.length ? `<details class="cw-details"><summary>Что не взяли · ${refs.notTaken.length}</summary><ul class="cw-todo">${refs.notTaken.map(t => `<li><i class="cw-dot info"></i>${escape(t)}</li>`).join('')}</ul></details>` : ''}</section>
    ${refs.groups.slice(1).map(gallery).join('')}
    <p class="subtle cw-note">${escape(refs.note)}</p>`;
}

export const renderChessRules = context => context?.activeRules ? `<details class="cw-details"><summary>Правила процесса · ${context.activeRules.length}</summary><ul class="cw-todo">${context.activeRules.map(r => `<li><i class="cw-dot info"></i><strong>${escape(r.id)}</strong> ${escape(r.decision)}</li>`).join('')}</ul></details>` : '';
const screenNumber = (revision, id) => { const s = revision?.screens.find(x => x.id === id); return s ? s.name.slice(0, 2) : id.startsWith('all') ? 'все' : id; };
const swatchColor = hex => { const m = /#([0-9a-f]{6})(?:\s+(\d+)%)?/i.exec(hex); if (!m) return 'transparent'; const n = parseInt(m[1], 16); return m[2] ? `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${Number(m[2]) / 100})` : `#${m[1]}`; };

export function renderChessDS(ds, context, revision) {
  if (!ds) return loading('Загружаю дизайн-систему…');
  const main = ds.components.filter(c => PREVIEWS[c.name]);
  const icons = ds.components.filter(c => !PREVIEWS[c.name]);
  const libUrl = id => figma(ds.sources.designSystem.fileKey, id);
  const chips = list => `<div class="cw-chips">${[...new Set(list.map(id => screenNumber(revision, id)))].map(n => `<span>${escape(n)}</span>`).join('')}</div>`;
  const card = c => `<article class="cw-card"><div class="cw-card-images">${PREVIEWS[c.name].map(p => `<img src="${preview(p)}" alt="${escape(c.name)} на экране" loading="lazy">`).join('')}</div><div class="cw-card-body"><h3>${external(libUrl(c.libNodeId), escape(c.name))}</h3><p title="${escape((c.variantsUsed || []).join('\n'))}">${escape((c.variantsUsed || []).join(' · '))}</p>${chips(c.screens)}</div></article>`;
  const iconCard = `<article class="cw-card"><div class="cw-card-images"><img src="${preview('header')}" alt="Иконки в шапке" loading="lazy"><img src="${preview('nav')}" alt="Иконки в навигации" loading="lazy"></div><div class="cw-card-body"><h3>Иконки · ${icons.length}</h3><div class="cw-chips">${icons.map(c => `<a href="${escape(libUrl(c.libNodeId))}" target="_blank" rel="noopener noreferrer">${escape(c.name)}</a>`).join('')}</div></div></article>`;
  const local = ds.localComponents.map(c => { const key = Object.keys(LOCAL_PREVIEWS).find(k => c.name.startsWith(k)); return `<article class="cw-card ${c.name.includes('GAP') ? 'gap' : ''}">${key ? `<div class="cw-card-images"><img src="${preview(LOCAL_PREVIEWS[key])}" alt="" loading="lazy"></div>` : ''}<div class="cw-card-body"><h3>${escape(c.name)}</h3><p>${c.rawPaints === 0 ? 'Все цвета — переменные Poker lib' : `Цветов вне DS: ${c.rawPaints}`}</p></div></article>`; }).join('');
  const designGaps = ds.gaps.filter(g => g.type === 'DESIGN_GAP');
  const productGaps = ds.gaps.filter(g => g.type !== 'DESIGN_GAP');
  return `<header class="cw-head"><div><span class="eyebrow">♦️ Poker lib в шахматах</span><h2>Дизайн-система</h2></div><div class="cw-head-actions">${external(libUrl(ds.sources.designSystem.colorsPage), 'Библиотека', 'button quiet')}</div></header>
    <section class="cw-section"><h3 class="cw-section-title">Компоненты <span>${main.length + icons.length}</span></h3><div class="cw-cards">${main.map(card).join('')}${iconCard}</div></section>
    <section class="cw-section"><h3 class="cw-section-title">Пробелы DS <span>${designGaps.length}</span></h3><div class="cw-cards">${designGaps.map(g => `<article class="cw-card gap">${GAP_PREVIEWS[g.id] ? `<div class="cw-card-images"><img src="${preview(GAP_PREVIEWS[g.id])}" alt="" loading="lazy"></div>` : ''}<div class="cw-card-body"><h3>${escape(g.what)}</h3><p>${escape(g.temporary ? 'Сейчас: ' + g.temporary : g.decision || '')}</p></div></article>`).join('')}</div>
    ${productGaps.length ? `<details class="cw-details"><summary>Решения продукта · ${productGaps.length}</summary><ul class="cw-todo">${productGaps.map(g => `<li><i class="cw-dot info"></i>${escape(g.what)}</li>`).join('')}</ul></details>` : ''}</section>
    <section class="cw-section"><h3 class="cw-section-title">Цвета <span>${ds.tokens.length}</span></h3><div class="cw-swatches">${ds.tokens.map(t => `<div class="cw-swatch"><i style="--swatch:${swatchColor(t.hex)}"></i><strong>${escape(t.variable)}</strong><span>${escape(t.hex)} · ${escape(t.role)}</span></div>`).join('')}</div></section>
    <section class="cw-section"><h3 class="cw-section-title">Шрифты</h3><div class="cw-type"><div><p class="cw-type-sample alumni">Выберите режим</p><span>Alumni Sans SemiBold Italic · 18–40 · заголовки, имена, метки</span></div><div><p class="cw-type-sample montserrat">Первые 10 партий дня</p><span>Montserrat Medium / SemiBold / Bold · 9–20 · текст, цифры, кнопки</span></div></div></section>
    <section class="cw-section"><h3 class="cw-section-title">Локальные компоненты шахмат</h3><div class="cw-cards">${local}</div></section>
    ${renderChessRules(context)}`;
}
