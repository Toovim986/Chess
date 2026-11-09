// Integration test for the locally developed gallery in an isolated headless browser.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const { chromium }=require('C:/Users/Toovim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='D:/Porfiriy/Projects/Work/Верификатор/docs/concept-import-2026-10-27';
const proof=JSON.parse(fs.readFileSync(root+'/import-proof.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  const checks=[];
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(proof.url);await page.locator('.design-audit-gallery img').first().waitFor();
    assert.equal(await page.locator('.design-audit-gallery img').count(),3);
    assert.match(await page.locator('#app').innerText(),/исправленные концепты/);
    assert.match(await page.locator('#app').innerText(),/Концепты для обсуждения/);
    assert.match(await page.locator('#app').innerText(),/INCOMPLETE/);
    assert.equal(await page.locator('#app a[href*="figma.com"]').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const image of await page.locator('.design-audit-gallery img').all()) {
      await image.scrollIntoViewIfNeeded();await image.evaluate(i=>i.decode());const size=await image.evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight}));assert.deepEqual(size,{w:1586,h:992});
    }
    await page.locator('.design-audit-gallery').scrollIntoViewIfNeeded();
    await page.screenshot({path:root+`/gallery-${width}.png`});
    await page.reload();await page.locator('.design-audit-gallery img').first().waitFor();assert.equal(await page.locator('.design-audit-gallery img').count(),3);
    checks.push({width,images:3,reload:'PASS',overflow:false});
  }
  const parentLink=page.getByRole('link',{name:'Предыдущая поставка: снимки и отчёты до исправлений →'});await parentLink.click();
  await page.locator('.design-audit-gallery img').first().waitFor();assert.match(await page.locator('#app').innerText(),/первоначальные концепты/);
  await page.goto(proof.url);await page.locator('.design-audit-gallery img').first().waitFor();
  const href=await page.locator('.design-audit-gallery a').first().getAttribute('href');const imageResponse=await page.request.get(new URL(href,page.url()).href);assert.equal(imageResponse.status(),200);assert.match(imageResponse.headers()['content-type'],/image\/png/);
  assert.deepEqual(errors,[]);
  const result={status:'PASS',scope:'Isolated headless integration test of local concept gallery; no approval of game designs',url:proof.url,checks,parentNavigation:'PASS',imageDownload:'PASS',javascriptErrors:errors};
  fs.writeFileSync(root+'/gallery-proof.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
