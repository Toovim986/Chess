import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Toovim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = 'http://127.0.0.1:43132';
const proofDir = new URL('../integration/chess-screen-map-2026-10-27/', import.meta.url);
fs.mkdirSync(proofDir, { recursive: true });
const reference = await fetch(base + '/screen-map/chess.json').then(response => response.json());
assert.equal(reference.profileId, 'chess');
assert.equal(reference.screens.length, 12);
const ids = new Set(reference.screens.map(screen => screen.id));
for (const group of reference.groups) for (const id of group.screenIds) assert.ok(ids.has(id));
for (const flow of reference.flows) for (const id of flow.steps) assert.ok(ids.has(id));
for (const screen of reference.screens) {
  for (const component of screen.components) assert.ok(reference.components.some(item => item.id === component), component);
  for (const transition of screen.outgoing) assert.ok(ids.has(transition.to));
  for (const image of [screen.image, ...screen.variants]) {
    const response = await fetch(`${base}/api/audits/${image.auditId}/artifacts/${image.artifactId}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/png/);
  }
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '/?view=screen-map');
    await page.getByRole('heading', { name: 'Карта экранов шахмат', exact: true }).waitFor();
    await page.locator('.chess-map-node').last().waitFor();
    assert.equal(await page.locator('.chess-map-node').count(), 12);
    assert.equal(await page.getByText('ЭТАЛОН · POKER', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Десктопная', exact: true }).count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('button', { name: 'Вариант B', exact: true }).click();
    assert.match(await page.locator('.chess-annotated-image img').getAttribute('src'), /image-2$/);
    for (const screen of reference.screens) {
      await page.locator(`.chess-map-node[data-chess-screen="${screen.id}"]`).click();
      assert.equal(await page.locator('.chess-map-node.selected').getAttribute('data-chess-screen'), screen.id);
      await page.locator('#chess-screen-detail').getByText(screen.summary, { exact: true }).waitFor();
      const image = page.locator('.chess-annotated-image img');
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(element => element.decode());
      assert.ok(await image.evaluate(element => element.naturalWidth > 0));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await page.locator('.chess-map-node[data-chess-screen="home"]').click();
    await page.getByRole('button', { name: 'Вариант A', exact: true }).click();
    for (const image of await page.locator('.chess-ds-sample img').all()) await image.evaluate(element => element.decode());
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: fileURLToPath(new URL(`map-${width}.png`, proofDir)), animations: 'disabled' });
    await page.locator('#chess-screen-detail').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.screenshot({ path: fileURLToPath(new URL(`components-${width}.png`, proofDir)), animations: 'disabled' });
    checks.push({ width, screens: 12, variantSwitch: 'PASS', images: 'PASS', overflow: 'PASS' });
  }
  await page.reload();
  await page.locator('.chess-map-node').last().waitFor();
  await page.route('**/screen-map/chess.json', route => route.fulfill({ status: 503, body: 'temporary test failure' }), { times: 1 });
  await page.reload();
  await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
  await page.locator('.chess-map-node').last().waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  const proof = { scope: 'Chess screen-map UI and referenced image delivery; not DS certification of PNG concepts', status: 'PASS', checks, reload: 'PASS', errorRecovery: 'PASS', javascriptErrors: errors, url: base + '/?view=screen-map' };
  fs.writeFileSync(new URL('browser-proof.json', proofDir), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await browser.close();
}
