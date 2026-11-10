import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]+$/,'').replace(/\\/g,'/');
const concept = path.join(root, 'profiles/chess/concepts/2026-10-27-mobile-v1');
const incoming = path.join(root, 'profiles/chess/incoming/chess-mobile-concepts-2026-10-27');
const proofDir = path.join(root, 'docs/concept-import-2026-10-27');
const base = 'http://127.0.0.1:43130';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const report = JSON.parse(fs.readFileSync(path.join(concept, 'review.json'), 'utf8'));
assert.equal(fs.existsSync(incoming), false, 'Do not overwrite an existing import');
fs.mkdirSync(incoming, { recursive: true });
const copyFiles = ['01-game-profile.png','02-tasks-league.png','03-additional-mechanics.png','history/02-tasks-league-r1.png','history/03-additional-mechanics-r1.png','review.json','prompts.json','edit-prompts.json'];
for (const file of copyFiles) {
  const dest = path.join(incoming,file); fs.mkdirSync(path.dirname(dest), {recursive:true});
  fs.copyFileSync(path.join(concept,file),dest,fs.constants.COPYFILE_EXCL);
  assert.equal(hash(fs.readFileSync(dest)),hash(fs.readFileSync(path.join(concept,file))));
}
fs.writeFileSync(path.join(incoming,'initial-review.json'),JSON.stringify({purpose:'Первоначальные PNG-концепты для обсуждения',issues:report.revisions.map(r=>({board:r.board,before:r.before})),limits:report.assumptions},null,2));
const document = report.source;
function manifest(revised) {
  const images = revised ? ['01-game-profile.png','02-tasks-league.png','03-additional-mechanics.png'] : ['01-game-profile.png','history/02-tasks-league-r1.png','history/03-additional-mechanics-r1.png'];
  const names = ['Игра и профиль — 4 экрана','Задачи и соревнование — 4 экрана','Дополнительные механики — 4 экрана'];
  const files = images.map((file,i)=>({id:`board-${i+1}`,label:names[i],role:'concept',path:`chess-mobile-concepts-2026-10-27/${file}`}));
  for(const file of ['prompts.json', revised?'review.json':'initial-review.json',...(revised?['edit-prompts.json']:[])]) files.push({id:file.split('.')[0],label:file,role:'report',path:`chess-mobile-concepts-2026-10-27/${file}`});
  const reviewId = revised?'review':'initial-review';
  const checks = [
    {id:'storage',name:'Сохранность PNG и отчётов',status:'PASS',summary:'Импортированные байты и SHA-256 проверены отдельно от дизайна.',artifactIds:['board-1','board-2','board-3',reviewId]},
    {id:'ds',name:'Соответствие дизайн-системе',status:'INCOMPLETE',summary:'Визуальная интерпретация Poker Library. Реальные экземпляры компонентов и токены Figma не проверялись.',artifactIds:[reviewId]},
    {id:'composition',name:'Мобильная композиция',status:'WARN',summary:'Предложено 12 экранов в трёх подборках для обсуждения. Композиция и навигация не утверждены.',artifactIds:['board-1','board-2','board-3']},
    {id:'states',name:'Полнота состояний',status:'INCOMPLETE',summary:'Основные концепты; ошибки, загрузка, ничья, поражение и остальные переходы не покрыты.',artifactIds:[reviewId]},
    {id:'visual',name:'Визуальное ревью',status:'WARN',summary:revised?'Подборки просмотрены. Исправлены баланс, имя аккаунта и тексты вне ГДД. Типографика и аватары требуют унификации в редактируемых макетах.':'Первоначальный просмотр: выявлены неодинаковый баланс, имя из Poker и неподтверждённая задача обучения.',artifactIds:['board-1','board-2','board-3',reviewId]},
    {id:'runtime',name:'Работа приложения',status:'INCOMPLETE',summary:'Это статические изображения; приложение и игровые действия не реализованы.',artifactIds:[reviewId]}
  ];
  return {schema:'verifier-design-audit/1',profileId:'chess',kind:'concept',title:revised?'Chess · 12 мобильных экранов · исправленные концепты':'Chess · 12 мобильных экранов · первоначальные концепты',summary:'Три изображения: игра и профиль; задачи и соревнование; дополнительные механики. Концепты для обсуждения по ГДД VKChess, не макеты для вёрстки.',capturedAt:new Date(Math.max(...images.map(f=>fs.statSync(path.join(concept,f)).mtimeMs))).toISOString(),
    source:{kind:'google-docs',documentId:document.documentId,revision:document.revision},target:{kind:'image-concept'},
    coverage:{expectedSourceFrames:1,expectedTargetFrames:3},
    sources:[{id:'gdd-chess',name:'VKChess: идеи меты · ГДД',targetIds:['concept-board-1','concept-board-2','concept-board-3']}],
    screens:images.map((file,i)=>{const b=fs.readFileSync(path.join(concept,file));return{id:`concept-board-${i+1}`,name:names[i],width:b.readUInt32BE(16),height:b.readUInt32BE(20),sourceIds:['gdd-chess'],screenshotArtifact:`board-${i+1}`};}),
    checks,artifacts:files,limitations:report.assumptions.concat(['Новые Figma-узлы не создавались. Ссылки на них отсутствуют.','Изображения получены через imagegen. Это не детерминированный экспорт компонентов библиотеки.']),
    findings:revised?report.revisions.map((r,i)=>({id:`correction-${i+1}`,nodeId:`concept-board-${i+2}`,title:i?'Аккаунт и тексты дополнительных механик':'Одинаковый демонстрационный баланс',detail:r.after,status:'FIXED',severity:'info',artifactIds:[`board-${i+2}`,'review'],before:r.before,after:r.after})):[]};
}
let state = await fetch(base+'/api/state').then(r=>r.json()); assert.equal(state.profileId,'chess');
assert.equal(state.audits.some(a=>a.title.startsWith('Chess · 12 мобильных')),false,'Already imported');
async function post(input) {
  const r=await fetch(base+'/api/audits',{method:'POST',headers:{Origin:base,'X-Verifier-Token':state.csrf,'Content-Type':'application/json'},body:JSON.stringify(input)});
  const body=await r.json();assert.equal(r.status,201,JSON.stringify(body));return body;
}
const initial=manifest(false);fs.writeFileSync(path.join(incoming,'manifest-r1.json'),JSON.stringify(initial,null,2));
const first=await post(initial);
const before=Buffer.from(await (await fetch(base+`/api/audits/${first.id}/report`)).arrayBuffer());
const revised={...manifest(true),parentAuditId:first.id};fs.writeFileSync(path.join(incoming,'manifest-r2.json'),JSON.stringify(revised,null,2));
const second=await post(revised);
const proofs=[];
for(const audit of [first,second]) {
  const r=await fetch(base+`/api/audits/${audit.id}/report`);const bytes=Buffer.from(await r.arrayBuffer());
  assert.equal(hash(bytes),audit.manifestHash);const saved=JSON.parse(bytes);assert.equal(saved.status,'INCOMPLETE');
  for(const a of saved.artifacts){const asset=await fetch(base+`/api/audits/${audit.id}/artifacts/${a.id}`);assert.equal(asset.status,200);const b=Buffer.from(await asset.arrayBuffer());assert.equal(hash(b),a.sha256);assert.equal(b.length,a.bytes);}
  proofs.push({id:audit.id,status:saved.status,storage:'PASS',artifacts:saved.artifacts.length,manifestHash:audit.manifestHash});
}
assert.deepEqual(Buffer.from(await (await fetch(base+`/api/audits/${first.id}/report`)).arrayBuffer()),before);
state=await fetch(base+'/api/state').then(r=>r.json());assert.equal(state.audits[0].id,second.id);
const proof={scope:'PNG concept gallery import; not design certification',status:'PASS',revisions:proofs,parentPreserved:true,url:base+'/?audit='+second.id};
fs.writeFileSync(path.join(proofDir,'import-proof.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof,null,2));
