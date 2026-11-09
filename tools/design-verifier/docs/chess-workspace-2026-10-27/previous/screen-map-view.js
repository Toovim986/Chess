import { renderChessScreenMap } from './chess-screen-map.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fileKey = 'mKX13PSo2vqwCXCBQJiOi8';
const figmaUrl = id => `https://www.figma.com/design/${fileKey}/?node-id=${encodeURIComponent(id)}`;
const link = (id, label, cls = 'text-link') => `<a class="${cls}" href="${figmaUrl(id)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
const preview = (file, alt, id) => `<figure class="screen-map-preview"><a href="/screen-map/${file}.png" target="_blank" rel="noopener noreferrer" aria-label="${escape(alt)} — открыть изображение"><img src="/screen-map/${file}.png" alt="${escape(alt)}" loading="lazy"></a><figcaption><a class="text-link" href="/screen-map/${file}.png" target="_blank" rel="noopener noreferrer">Открыть крупнее ↗</a>${link(id,'Открыть в Figma')}</figcaption></figure>`;

export function renderScreenMap(reference, error, mode = 'mobile', selected = 'home', variant = 'a', profileId) {
  if (profileId === 'chess' || reference?.schema === 'verifier-chess-screen-map/1') return renderChessScreenMap(reference, error, selected, variant);
  const intro = `<div class="intro-row screen-map-intro"><div><span class="eyebrow">ДИЗАЙН → ФРОНТЕНД / ЭТАЛОН ПЕРЕДАЧИ</span><h2>Карта экрана</h2><p>Как устроен экран, из каких компонентов он собран и по каким правилам работает.</p></div>${link('3:3','Открыть эталон','button primary')}</div>`;
  if (error) return intro + `<div class="panel empty" role="alert"><p>${escape(error)}</p><button class="button" data-action="retry-screen-map">Повторить загрузку</button></div>`;
  if (!reference) return intro + '<div class="panel empty" role="status">Загружаю карту экрана…</div>';
  const map = reference.pages.find(p => p.pageId === '3:3');
  const contract = reference.pages.find(p => p.pageId === '3:4');
  const mobile = mode !== 'desktop', prefix = mobile ? 'M' : 'D';
  const items = map.texts.flatMap((item,i) => new RegExp(`^${prefix}\\d+\\s`).test(item.text) ? [{...item,description:map.texts[i+1]?.text || ''}] : []);
  const text = id => contract.texts.find(t => t.id === id)?.text || '';
  const contractSections = [
    {title:'Адаптивность',id:'9:97',body:`MOBILE\n${text('9:101')}\n\nDESKTOP\n${text('9:103')}`},
    {title:'Поведение',id:'9:104',body:text('9:107')},
    {title:'Состояния',id:'9:108',body:text('9:111')},
    {title:'Ассеты и контент',id:'9:112',body:text('9:115')},
    {title:'Проверка перед передачей',id:'9:116',body:`${text('9:119')}\n\n${text('9:120')}`}
  ];
  return intro + `<section class="screen-map-context"><span class="tag">ЭТАЛОН · POKER</span><p>«Новости» — пример оформления передачи. Структуру используем для карт других экранов; размеры, состояния и поведение этого примера относятся к Poker.</p></section>
    <nav class="screen-map-steps" aria-label="Состав передачи"><a href="#screen-sketches"><span>01</span><strong>Эскизы экранов</strong><small>Визуальный результат</small></a><a href="#screen-component-map"><span>02</span><strong>Карта компонентов</strong><small>Границы, состав и варианты</small></a><a href="#screen-contract"><span>03</span><strong>Контракт экрана</strong><small>Поведение, состояния, контент</small></a></nav>
    <section class="panel screen-map-section" id="screen-component-map"><div class="panel-header"><span>02 / Карта компонентов</span><div class="screen-map-switch" role="group" aria-label="Версия карты"><button class="button ${mobile?'primary':'quiet'}" data-map-mode="mobile" aria-pressed="${mobile}">Мобильная</button><button class="button ${!mobile?'primary':'quiet'}" data-map-mode="desktop" aria-pressed="${!mobile}">Десктопная</button></div></div><div class="screen-map-body"><p class="subtle">Номера на схеме связывают границы компонентов с описанием. Положение задаётся относительно родителя и порядка в потоке.</p><div class="screen-map-layout">${preview(mobile?'mobile-map':'desktop-map',mobile?'Мобильная карта экрана Новости':'Десктопная карта экрана Новости',mobile?'12:101':'12:169')}<aside class="screen-map-inventory" aria-label="Состав компонентов"><h3>${mobile?'Мобильная · 375 × 812':'Десктопная · 1280 × 720'}</h3>${items.map(item=>`<article><h4>${link(item.id,item.text)}</h4><p>${escape(item.description)}</p></article>`).join('')}</aside></div></div></section>
    <section class="panel screen-map-section" id="screen-sketches"><div class="panel-header"><span>01 / Эскизы экранов</span>${link('3:2','Screen Sketches')}</div><div class="screen-map-body"><p class="subtle">Два визуальных эталона: мобильный 375 × 812 и десктопный 1280 × 720. В Figma сохранены редактируемые экраны с экземплярами news card из Poker Library.</p>${preview('sketches','Эскизы экрана Новости: мобильная и десктопная версии','6:109')}</div></section>
    <section class="panel screen-map-section" id="screen-contract"><div class="panel-header"><span>03 / Контракт экрана</span>${link('3:4','Screen Contract')}</div><div class="screen-map-body"><p>Правила из эталона: адаптивность, действия, состояния и данные для фронтенда.</p><div class="screen-map-contract">${contractSections.map((section,i)=>`<details ${i===0?'open':''}><summary>${escape(section.title)}</summary><div class="screen-map-contract-text">${escape(section.body)}</div>${link(section.id,'Раздел в Figma')}</details>`).join('')}</div><details class="screen-map-contract-preview"><summary>Показать оригинальную карточку контракта</summary>${preview('contract','Контракт экрана Новости','9:93')}</details></div></section>
    <footer class="screen-map-provenance"><p>Снимок Figma: ${escape(reference.capturedAt)}. Обновление источника выполняется через ассистента.</p><a class="text-link" href="/screen-map/reference.json" target="_blank" rel="noopener noreferrer">Сохранённая структура и точные ID ↓</a></footer>`;
}
