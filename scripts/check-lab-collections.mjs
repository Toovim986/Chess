import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

// Run once club/verification.json and arena/verification.json exist.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Toovim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const base = (process.env.VERIFIER_URL || 'http://127.0.0.1:43132').replace(/\/$/, '');
const collectionRoot = path.join(root, 'artifacts/concepts/chess-lab-2026-10-28');
const proofDir = path.join(root, 'integration/chess-lab-2026-10-28');
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const collections = ['club', 'arena'].map(name => {
  const directory = path.join(collectionRoot, name);
  const input = readJson(path.join(directory, 'collection.json'));
  const verification = readJson(path.join(directory, 'verification.json'));
  const manifest = readJson(path.join(directory, 'manifest.json'));
  assert.equal(verification.storageVerification, 'PASS', `${name}: импорт ещё не проверен`);
  assert.equal(manifest.id, verification.auditId);
  assert.equal(manifest.title, input.title);
  assert.equal(manifest.screens.length, 13);
  return { name, title: input.title, auditId: verification.auditId, manifest };
});
const previous = [
  { id: 'audit-1793101230391-7b15ae', hash: '0f014c2f184b669c23240e3887bb8e404845c0b6d51dbd250c110404e53ddf11' },
  { id: 'audit-1793099238237-5e166a', hash: '4f198eb062370fdc18a35ff91a978de5bc989aff08a8cd7c1f5f4378148fcc85' },
  { id: 'audit-1793099238121-d4efd6', hash: '9849ac430b26ccdbc4abf7e23bace97de4b05aff833029cc64b72f10dd1a1c64' },
];
const stateResponse = await fetch(`${base}/api/state`);
assert.equal(stateResponse.status, 200);
const state = await stateResponse.json();
assert.equal(state.profileId, 'chess');
for (const item of previous) {
  const stored = state.audits.find(audit => audit.id === item.id);
  assert.ok(stored, `Старая коллекция пропала: ${item.id}`);
  assert.equal(stored.manifestHash, item.hash, `Старая коллекция изменена: ${item.id}`);
  item.title = stored.title;
}
for (const collection of collections) {
  assert.equal(state.audits.filter(audit => audit.title === collection.title).length, 1, 'Дублирующееся название коллекции');
  assert.ok(state.audits.some(audit => audit.id === collection.auditId && audit.kind === 'concept'));
}
fs.mkdirSync(proofDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
const javascriptErrors = [], consoleErrors = [], failedRequests = [], checks = [];
page.on('pageerror', error => javascriptErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('requestfailed', request => {
  if (request.failure()?.errorText !== 'net::ERR_ABORTED') failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
});
page.setDefaultTimeout(15000);

function sectionFor(title) {
  return page.locator('section.cw-lab').filter({ has: page.locator('h3', { hasText: title }) });
}

async function assertNoOverflow(label) {
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(bounds.document <= bounds.viewport + 1 && bounds.body <= bounds.viewport + 1, `${label}: горизонтальное переполнение ${JSON.stringify(bounds)}`);
}

async function openLab({ navigate = false } = {}) {
  if (navigate) {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.cw-strip .cw-thumb').first().waitFor();
    const navigation = page.locator('.navigation [data-view="audits"]');
    if (!await navigation.isVisible()) await page.locator('[data-action="menu"]').click();
    await navigation.click();
  }
  const tab = page.locator('[data-mock-tab="lab"]');
  await tab.waitFor();
  await tab.click();
  await page.getByRole('navigation', { name: 'Коллекции экспериментариума' }).waitFor();
  assert.equal(await page.locator('.cw-collection-nav a').count(), 3, 'Нужны три основные коллекции');
  assert.equal(await page.locator('section.cw-lab').count(), 3);
  for (const collection of collections) {
    const section = sectionFor(collection.title);
    assert.equal(await section.count(), 1, `Коллекция не отображается: ${collection.title}`);
  }
  assert.equal(await sectionFor('Коллекция 1 · первые решения').count(), 1);
  for (const item of previous.filter(item => item.id !== 'audit-1793099238237-5e166a')) assert.equal(await page.locator(`[data-early-audit="${item.id}"]`).count(), 1);
}

try {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await openLab({ navigate: true });
    await assertNoOverflow(`Экспериментариум ${width}`);
    let imagesDecoded = 0;
    const lightboxes = [];
    for (const collection of collections) {
      const section = sectionFor(collection.title);
      const images = section.locator('.cw-thumb img');
      assert.equal(await images.count(), 13, `${collection.name}: неполная галерея`);
      for (const screen of collection.manifest.screens) {
        const suffix = `/api/audits/${collection.auditId}/artifacts/${screen.screenshotArtifact}`;
        const image = section.locator(`img[src="${suffix}"]`);
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(element => element.decode());
        const dimensions = await image.evaluate(element => ({ width: element.naturalWidth, height: element.naturalHeight }));
        const artifact = collection.manifest.artifacts.find(item => item.id === screen.screenshotArtifact);
        assert.deepEqual(dimensions, artifact.dimensions, `${collection.name}: декодирован не тот PNG ${screen.id}`);
        imagesDecoded++;
        await assertNoOverflow(`${collection.name} / ${screen.id} / ${width}`);
      }
      await section.locator('h3').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(proofDir, `${collection.name}-${width}.png`), animations: 'disabled' });
      const copy = section.locator('[data-copy-collection]');
      const directUrl = new URL(await copy.getAttribute('data-copy-collection'), base).href;
      assert.equal(new URL(directUrl).searchParams.get('audit'), 'audit-1793113544095-c990fe');
      assert.equal(new URL(directUrl).searchParams.get('mockTab'), 'lab');
      assert.equal(new URL(directUrl).hash, `#collection-${collection.auditId}`);
      await copy.click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), directUrl);
      const first = section.locator('.cw-thumb').first();
      await first.click();
      await page.locator('#lightbox[open]').waitFor();
      await page.locator('#lightbox-image').evaluate(element => element.decode());
      assert.equal(await page.locator('#lightbox-image').getAttribute('src'), await first.getAttribute('data-src'));
      await assertNoOverflow(`Просмотр ${collection.name} / ${width}`);
      await page.screenshot({ path: path.join(proofDir, `${collection.name}-lightbox-${width}.png`), animations: 'disabled' });
      await page.locator('#lightbox [data-close="lightbox"]').click();
      await page.locator('#lightbox[open]').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#lightbox').evaluate(element => element.open), false);
      lightboxes.push({ collection: collection.name, open: 'PASS', close: 'PASS' });
    }
    assert.equal(imagesDecoded, 26);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openLab();
    for (const collection of collections) assert.equal(await sectionFor(collection.title).locator('.cw-thumb img').count(), 13);
    await assertNoOverflow(`После перезагрузки ${width}`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(proofDir, `lab-reload-${width}.png`), animations: 'disabled' });
    checks.push({ width, navigation: 'PASS', collections: 2, imagesDecoded, previousCollections: 3, overflow: 'PASS', reload: 'PASS', lightboxes });
  }
  for (const collection of collections) {
    const directUrl = `${base}/?audit=audit-1793113544095-c990fe&mockTab=lab#collection-${collection.auditId}`;
    await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
    await page.locator(`[id="collection-${collection.auditId}"]`).waitFor();
    assert.equal(await page.locator('[data-mock-tab="lab"]').getAttribute('aria-selected'), 'true');
    assert.equal(new URL(page.url()).hash, `#collection-${collection.auditId}`);
    assert.equal(await page.locator('.cw-collection-nav a').count(), 3);
    await assertNoOverflow(`Прямая ссылка ${collection.name}`);
  }
  assert.equal(javascriptErrors.length, 0, javascriptErrors.join('\n'));
  assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'));
  assert.equal(failedRequests.length, 0, JSON.stringify(failedRequests));
  const proof = {
    status: 'PASS', verifiedAt: new Date().toISOString(),
    scope: 'Галерея экспериментариума, доставка и декодирование 26 PNG, навигация, просмотр, перезагрузка и отсутствие горизонтального переполнения. Проверка не подтверждает содержание дизайна.',
    checks, previousCollections: previous, javascriptErrors, consoleErrors, failedRequests,
    collections: collections.map(({ name, title, auditId }) => ({ name, title, auditId, url: `${base}/?audit=${auditId}` })),
  };
  fs.writeFileSync(path.join(proofDir, 'browser-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(proofDir, 'failure.png'), animations: 'disabled' }).catch(() => {});
  fs.writeFileSync(path.join(proofDir, 'browser-failure.json'), JSON.stringify({ status: 'FAIL', error: error.stack, checks, javascriptErrors, consoleErrors, failedRequests }, null, 2) + '\n');
  throw error;
} finally {
  await browser.close();
}
