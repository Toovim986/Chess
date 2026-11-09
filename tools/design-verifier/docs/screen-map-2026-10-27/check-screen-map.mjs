import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const { chromium }=require('C:/Users/Toovim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='D:/Porfiriy/Projects/Work/Верификатор';
const proofDir=root+'/docs/screen-map-2026-10-27';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();const errors=[];const checks=[];page.on('pageerror',e=>errors.push(e.message));
try {
  for(const [profile,port] of [['chess',43130],['poker',43131]]) {
    const base=`http://127.0.0.1:${port}`;
    for(const width of [1440,1024,820,390]) {
      await page.setViewportSize({width,height:1000});await page.goto(base+'/?view=screen-map');
      await page.locator('.screen-map-inventory article').first().waitFor();
      assert.equal(await page.locator('.navigation [data-view]').count(),7);
      assert.equal(await page.locator('[data-view="screen-map"]').getAttribute('aria-current'),'page');
      assert.equal(await page.locator('.screen-map-inventory article').count(),8);
      assert.match(await page.locator('.screen-map-context').innerText(),/относятся к Poker/);
      const mobile=page.getByAltText('Мобильная карта экрана Новости');await mobile.scrollIntoViewIfNeeded();await mobile.evaluate(i=>i.decode());
      assert.equal(await mobile.evaluate(i=>i.naturalWidth),980);
      await page.getByRole('button',{name:'Десктопная',exact:true}).click();assert.equal(await page.locator('.screen-map-inventory article').count(),9);
      const desktop=page.getByAltText('Десктопная карта экрана Новости');await desktop.scrollIntoViewIfNeeded();await desktop.evaluate(i=>i.decode());assert.equal(await desktop.evaluate(i=>i.naturalWidth),1600);
      for(const img of await page.locator('.screen-map-preview img').all()) {
        if(await img.isVisible()){await img.scrollIntoViewIfNeeded();await img.evaluate(i=>i.decode());}
      }
      await page.locator('.screen-map-contract details').filter({has:page.locator('summary',{hasText:'Поведение'})}).locator('summary').click();
      assert.match(await page.locator('.screen-map-contract details[open]').allTextContents().then(x=>x.join('\n')),/Sidepage/);
      const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:Array.from(document.querySelectorAll('body *')).map(e=>({tag:e.tagName,cls:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(e=>e.right>innerWidth+1&&e.left>=0).slice(0,12)}));
      assert.equal(overflow.scroll>width,false,`${profile} overflow at ${width}: ${JSON.stringify(overflow)}`);
      await page.goto(base+'/?view=screen-map');await page.locator('.screen-map-inventory article').first().waitFor();
      if(width===390) await page.locator('[data-action="menu"]').click();
      await page.getByRole('button',{name:'Ревизии макетов',exact:true}).click();
      if(profile==='chess'){await page.locator('.design-audit-gallery img').first().waitFor();assert.equal(await page.locator('.design-audit-gallery img').count(),3);}
      if(width===390)await page.locator('[data-action="menu"]').click();
      await page.getByRole('button',{name:'Карта экрана',exact:true}).click();await page.locator('.screen-map-inventory article').first().waitFor();
      assert.match(page.url(),/view=screen-map/);
      if(width===390){assert.equal(await page.locator('[data-action="menu"]').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);}
      await page.reload();await page.locator('.screen-map-inventory article').first().waitFor();
      if(profile==='chess'&&[1440,390].includes(width)) {
        await page.screenshot({path:proofDir+`/screen-map-${width}.png`});
        await page.locator('#screen-component-map').scrollIntoViewIfNeeded();await page.screenshot({path:proofDir+`/component-map-${width}.png`});
      }
      checks.push({profile,width,tab:true,componentCounts:[8,9],images:'PASS',navigation:'PASS',reload:'PASS',overflow:false});
    }
  }
  await page.route('**/screen-map/reference.json',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.goto('http://127.0.0.1:43130/?view=screen-map');await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(),/Не удалось/);await page.unroute('**/screen-map/reference.json');
  await page.getByRole('button',{name:'Повторить загрузку',exact:true}).click();await page.locator('.screen-map-inventory article').first().waitFor();
  assert.deepEqual(errors,[]);
  const artifacts=[];
  for(const file of ['reference.json','sketches.png','mobile-map.png','desktop-map.png','contract.png']) {
    const bytes=fs.readFileSync(root+'/verifier/public/screen-map/'+file);const response=await fetch('http://127.0.0.1:43130/screen-map/'+file);assert.equal(response.status,200);
    const saved=Buffer.from(await response.arrayBuffer());assert.deepEqual(saved,bytes);
    artifacts.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  const proof={status:'PASS',scope:'Screen Map reference tab, two profiles, source previews, responsive layout, navigation, reload and fetch error recovery; not approval of game designs',checkedAt:new Date().toISOString(),checks,errorRecovery:'PASS',javascriptErrors:errors,artifacts};
  fs.writeFileSync(proofDir+'/browser-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({status:proof.status,checks:checks.length,errorRecovery:proof.errorRecovery,javascriptErrors:errors,assets:artifacts.length}));
}finally{await browser.close();}
