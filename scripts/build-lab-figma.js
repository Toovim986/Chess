// Run with Figma use_figma in QZNrOb57obLvLAadEMSjV3, page 0:1.
await figma.setCurrentPageAsync(figma.root.children.find(p => p.id === '0:1'));
const variant = 'VARIANT';
const arena = variant === 'arena';
const prefix = arena ? 'LAB B · Арена' : 'LAB A · Клуб';
if (figma.currentPage.children.some(n => n.name.startsWith(prefix))) throw new Error('Collection already exists; inspect before retry');
const ids = ['6:2109','6:2110','6:2244','7:1085','7:1416','7:3419','6:2197','6:2222','6:2223','6:2129','6:2191','6:2299','6:2198','6:2221','6:2224','6:2233','7:1019','7:1067','7:1171','7:1185','7:1208','7:1234','7:1279','7:1334','7:3177','7:3195','7:3228','7:3376','7:3410','25:1048','25:1063','25:1100','25:1160','25:1405','25:1466','9:884','9:887','9:899','9:913','9:923','9:1091','9:1094','33:1449','37:2297'];
const src = new Map(await Promise.all(ids.map(async id => [id, await figma.getNodeByIdAsync(id)])));
const fontNames = new Map();
for (const id of ['6:2109','7:937','7:1147','7:3153','25:1047','9:734','9:941','33:1415']) {
  const root = await figma.getNodeByIdAsync(id);
  for (const t of root.findAllWithCriteria({types:['TEXT']})) for (const s of t.getStyledTextSegments(['fontName'])) fontNames.set(JSON.stringify(s.fontName), s.fontName);
}
await Promise.all([...fontNames.values()].map(f => figma.loadFontAsync(f)));
const created = [], frames = [];
const copy = (id, parent, width) => { const n = src.get(id).clone(); created.push(n.id); parent.appendChild(n); if(width) n.resize(width,n.height); return n; };
const titlePaint = src.get('6:2197').fills;
const purpleNode = await figma.getNodeByIdAsync('I7:1085;5:1255');
const purplePaint = purpleNode.fills;
const whitePaint = src.get('6:2222').fills;
const bodyPaint = src.get('6:2223').fills;
const panelPaint = src.get('6:2221').fills;
const bgPaint = src.get('6:2109').fills;
function box(parent, name, w, direction='VERTICAL', gap=12, panel=false) {
  const n=figma.createAutoLayout(direction); created.push(n.id); parent.appendChild(n); n.name=name; n.resize(w,1); n.primaryAxisSizingMode=direction==='VERTICAL'?'AUTO':'FIXED'; n.counterAxisSizingMode=direction==='VERTICAL'?'FIXED':'AUTO'; n.itemSpacing=gap; n.fills=panel?panelPaint:[];
  if(panel){ n.paddingTop=16;n.paddingBottom=16;n.paddingLeft=16;n.paddingRight=16; }
  return n;
}
function text(parent, str, kind='body', w=327) {
  const t=copy(kind==='title'?'6:2197':kind==='strong'?'6:2222':'6:2223',parent);
  t.characters=str;t.name=str; t.textAutoResize='HEIGHT'; t.resize(w,t.height); if(kind==='title'){t.fontSize=arena?36:32;t.lineHeight={unit:'PIXELS',value:40};if(arena)t.fills=purplePaint;} return t;
}
function relabel(root, replacements) { for(const n of root.findAllWithCriteria({types:['TEXT']})) if(replacements[n.characters]!==undefined)n.characters=replacements[n.characters]; }
function button(parent,label,w=327){ const b=copy('6:2224',parent,w);const t=b.findAllWithCriteria({types:['TEXT']})[0];t.characters=label; return b; }
function intro(body,kicker,heading,description){text(body,kicker,'strong');text(body,heading,'title'); if(description)text(body,description);}
function identity(body){const row=box(body,'Игрок · компактный профиль',327,'HORIZONTAL',12,true); row.counterAxisAlignItems='CENTER'; const avatar=copy('33:1449',row);avatar.resize(72,72);const col=box(row,'Имя и уровень',207);text(col,'Александра','title',207);text(col,'Уровень 12 · 2 340 / 3 000 EXP','body',207);}
function note(body,str){const n=box(body,'Примечание',327,'VERTICAL',8,true);text(n,str,'body',295);}
function screen(name,file,index,nav='6:2244',game=false){
 const f=figma.createFrame(); created.push(f.id); f.name=`${prefix} / ${name}`; f.resize(375,812);f.x=6200+index*415;f.y=arena?3000:1900;f.fills=bgPaint;f.clipsContent=true;
 if(arena){const bg=copy('37:2297',f);bg.x=-534;bg.y=0;bg.opacity=0.38;}
 if(!game){const h=copy('6:2110',f);h.x=0;h.y=0;const n=copy(nav,f);n.x=0;n.y=740;}
 const body=box(f,'Основное содержимое',327,'VERTICAL',arena?12:16);body.x=24;body.y=game?16:72;
 frames.push({id:f.id,name,file,width:375,height:812});return {f,body};
}
// 01: two deliberately different entry compositions using the same DS parts.
{
const {body}=screen('01 · Главная','01-home.png',0);intro(body,arena?'ИГРОВАЯ АРЕНА':'ШАХМАТНЫЙ КЛУБ',arena?'Пора в игру':'Ваш следующий ход');
if(arena){const r=box(body,'Превью партии',327,'HORIZONTAL',16);const b=copy('25:1160',r);b.rescale(144/368); const col=box(r,'Приглашение',167);text(col,'Обычная партия','title',167);text(col,'Найдём соперника\nвашего уровня','body',167);button(col,'ИГРАТЬ',167);identity(body);}
else {identity(body);const card=box(body,'Основной игровой блок',327,'HORIZONTAL',16,true);const col=box(card,'Режим',159);text(col,'Обычная','title',159);text(col,'Весь кон победителю.\nОпыт за каждую партию.','body',159);const b=copy('25:1160',card);b.rescale(96/368);}
copy('6:2198',body,327);if(!arena)button(body,'ИГРАТЬ');copy('6:2233',body,327);
}
// 02 and 03: profile and separate allocation screen.
{
const {body}=screen('02 · Профиль','02-profile.png',1,'7:1085');intro(body,'ВАШ ПРОГРЕСС','Профиль игрока');identity(body);copy('6:2191',body,327);copy('6:2299',body,327);const stats=copy('7:1019',body,327);for(const n of stats.findAllWithCriteria({types:['INSTANCE']}))if(n.name.includes('plus'))n.visible=false;button(body,'РАСПРЕДЕЛИТЬ 5 ОЧКОВ');note(body,'За каждый новый уровень — 5 очков. Рамка аватара меняется вместе с уровнем.');
}
{
const {body}=screen('03 · Распределение очков','03-stats.png',2,'7:1085');intro(body,'ПРОФИЛЬ / ХАРАКТЕРИСТИКИ','Усильте свою игру','Доступно 5 очков. Выберите, какие характеристики развивать.');copy('7:1019',body,327);note(body,'Развивайте сильные стороны и пробуйте новые направления. Выберите то, что подходит вашему стилю.');copy('7:1067',body,327);text(body,'Изменения вступят в силу после сохранения.');
}
// 04: task browsing; 05: dedicated task board.
{
const {body}=screen('04 · Задачи','04-tasks.png',3,'7:1416');intro(body,'ТРЕНИРОВКА',arena?'Прокачайте тактику':'Задача на сегодня');copy('7:1171',body,327);copy('7:1185',body,327);copy('7:1208',body,327);copy('7:1234',body,327);copy('7:1279',body,327);copy('7:1334',body,327);
}
{
const {body}=screen('05 · Решение задачи','05-task-board.png',4,'7:1416');intro(body,'ТАКТИКА · ЛЁГКАЯ','Найдите лучший ход','Ход белых. Выберите фигуру и продолжение.');const b=copy('25:1160',body);b.rescale(327/368);note(body,'Награда: +40 пешек · +25 EXP\nДумайте без спешки. Время не ограничено.');button(body,'ПРОВЕРИТЬ ХОД');
}
// 06: league, with a different information hierarchy in each collection.
{
const {body}=screen('06 · Лига','06-league.png',5,'7:3419');intro(body,'СОРЕВНОВАНИЕ',arena?'Поднимайтесь выше':'Ваш дивизион');copy('7:3177',body,327);if(arena)copy('7:3376',body,327);copy('7:3195',body,327);copy('7:3228',body,327);if(!arena)copy('7:3376',body,327);button(body,'ИГРАТЬ В ТУРНИРЕ');
}
// 07: board-first layout, with a calmer club rail or a neon arena background.
{
const {f,body}=screen('07 · Партия','07-game.png',6,'6:2244',true);body.remove();copy('25:1048',f,375).y=0;copy('25:1063',f,375).y=56;const opponent=copy('25:1100',f,375);opponent.y=112;const board=copy('25:1160',f);board.rescale(343/368);board.x=16;board.y=208;const player=copy('25:1405',f,375);player.y=567;const actions=copy('25:1466',f,375);actions.y=731;const bonus=box(f,'Бонус партии',327,'VERTICAL',8,true);bonus.x=24;bonus.y=661;text(bonus,'Партия 4 из 10 · повышенная награда','body',295);
}
// 08/09: results become full screens rather than overlays.
for(const [i,win] of [[7,true],[8,false]]){
const {body}=screen(win?'08 · Победа':'09 · Поражение',win?'08-win.png':'09-loss.png',i);intro(body,'РЕЗУЛЬТАТ ПАРТИИ',win?(arena?'Отличная партия':'Победа за вами'):'Новая партия впереди',win?'Мат · обычная партия':'Поражение · обычная партия');identity(body);const reward=box(body,'Итоги и награда',327,'VERTICAL',12,true);text(reward,win?'+340 пешек':'+20 EXP','title',295);text(reward,win?'+120 EXP за победу':'Опыт за сыгранную партию','strong',295);text(reward,win?'Кон партии ваш.':'Каждая партия — новый опыт.','body',295);copy('9:913',body,327);copy('9:899',body,327);button(body,'ЕЩЁ ПАРТИЯ');button(body,'НА ГЛАВНУЮ');
}
// 10: calendar uses published tab controls and reward cards.
{
const {body}=screen('10 · Календарь','10-calendar.png',9);intro(body,'ЕЖЕДНЕВНЫЕ НАГРАДЫ',arena?'Серия продолжается':'Возвращайтесь за наградой','Заходите каждый день и собирайте награды.');copy('6:2233',body,327);const days=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];for(let r=0;r<2;r++){const row=box(body,'Неделя '+(r+1),327,'HORIZONTAL',8);for(let j=0;j<4;j++){const k=r*4+j;if(k>6)break;const card=box(row,'День '+(k+1),75,'VERTICAL',8,true);card.paddingLeft=8;card.paddingRight=8;text(card,days[k],'strong',59);text(card,k<3?'✓':String(k+1),'title',59);text(card,k===6?'Бонус':'+20','body',59);}}note(body,'Сегодня · день 4\nПолучите награду и продолжайте серию.');button(body,'ПОЛУЧИТЬ НАГРАДУ');
}
// 11: territory visualised as board cells, retaining real piece instances.
{
const {body}=screen('11 · Территория','11-territory.png',10,'7:3419');intro(body,'КАРТА ВЛАДЕНИЙ',arena?'Контроль центра':'Ваши владения','Выберите область и развивайте свои владения.');const board=copy('25:1160',body);board.rescale(280/368);board.x=23;copy('7:3177',body,327);note(body,'Центральная область · уровень 2\nЗдесь начинается ваш путь.');button(body,'ОТКРЫТЬ ОБЛАСТЬ');
}
// 12: linked DS cards form a three-branch talent progression.
{
const {body}=screen('12 · Таланты','12-talents.png',11,'7:1085');intro(body,'РАЗВИТИЕ ПРОФИЛЯ',arena?'Свой стиль игры':'Дерево талантов','Три направления развития. Выберите близкий вам стиль.');for(const [id,name,desc] of [['7:1234','Тактика','Комбинации и атака'],['7:1279','Расчёт','Поиск продолжений'],['7:1334','Стратегия','Позиционная игра']]){const n=copy(id,body,327);const ts=n.findAllWithCriteria({types:['TEXT']});for(const t of ts){if(t.characters.includes('Мат в')||t.characters.includes('Выигрыш')||t.characters.includes('Эндшпиль'))t.characters=name;if(t.characters==='РЕШИТЬ')t.characters='ОТКРЫТЬ';} }note(body,'Таланты открываются по мере развития профиля. Продолжайте играть, чтобы открыть новые возможности.');button(body,'ВЫБРАТЬ НАПРАВЛЕНИЕ');
}
// 13: consumables use real DS controls, no generated substitute icons.
{
const {body}=screen('13 · Расходники','13-inventory.png',12,'7:1085');intro(body,'ИНВЕНТАРЬ',arena?'Готовы к партии':'Ваши расходники','Награды и полезные предметы, которые вы собрали.');for(const [id,name,count] of [['7:1234','Бонус опыта','3 шт.'],['7:1279','Обновление задач','2 шт.'],['7:1334','Награда за серию','1 шт.']]){const n=copy(id,body,327);for(const t of n.findAllWithCriteria({types:['TEXT']})){if(t.characters.includes('Мат в')||t.characters.includes('Выигрыш')||t.characters.includes('Эндшпиль'))t.characters=name;if(t.characters==='РЕШИТЬ')t.characters='ВЫБРАТЬ';if(t.characters.includes('EXP'))t.characters=count;}}note(body,'Выберите предмет, чтобы узнать о нём подробнее.');button(body,'К ПРОФИЛЮ');
}
const audits=[];
for(const info of frames){const f=await figma.getNodeByIdAsync(info.id);const nodes=f.findAll(()=>true);const counts={};for(const n of nodes)counts[n.type]=(counts[n.type]||0)+1;const fonts=[...new Set(nodes.filter(n=>n.type==='TEXT').flatMap(n=>n.getStyledTextSegments(['fontName']).map(s=>s.fontName.family)))];if(fonts.some(f=>!['Alumni Sans','Montserrat'].includes(f)))throw new Error('Unexpected font');audits.push({...info,descendants:nodes.length,nodeTypes:counts,fonts,instances:counts.INSTANCE||0,images:nodes.filter(n=>'fills'in n&&Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')).map(n=>({id:n.id,name:n.name,width:n.width,height:n.height}))});}
figma.io.write(`${variant}-structure.json`,JSON.stringify({variant,createdNodeIds:created,frames:audits},null,2));
return {variant,createdNodeIds:created,frames:audits.map(({images,...x})=>({...x,imageCount:images.length}))};
