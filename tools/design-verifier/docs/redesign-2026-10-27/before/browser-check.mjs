// Optional browser proof: set PLAYWRIGHT_MODULE to an installed Playwright package.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createVerifier } from '../server.mjs';
const require = createRequire(import.meta.url);
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright package');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-browser-'));
const app = createVerifier({ profileId: 'chess', dataDir: path.join(root, 'data'), importRoot: path.join(root, 'incoming') });
const base = await app.listen(0), browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(base); await page.locator('.profile-setup').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Запустить проверку', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('[data-viewport-status]').getAttribute('data-viewport-status'), 'INCOMPLETE');
  assert.doesNotMatch(await page.locator('body').innerText(), /Poker|POKER|портрет|АВАТАР/);
  assert.equal(await page.locator('img[src^="/evidence/"]').count(), 0);
  for (const name of ['Правила и источники', 'Расхождения', 'История запусков', 'Ревизии макетов', 'Пометки', 'Пульт']) {
    await page.getByRole('button', { name: new RegExp('^' + name) }).first().click();
  }
  await page.getByRole('button', { name: 'Пометки', exact: true }).click();
  await page.getByLabel('Текст пометки').fill('Portable profile note <script>');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.locator('.note-card').waitFor();
  await page.reload(); await page.getByRole('button', { name: 'Пометки', exact: true }).click();
  assert.match(await page.locator('.note-card').innerText(), /Portable profile note <script>/);
  await page.getByRole('button', { name: 'Пульт', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Правила и источники', exact: true }).click();
  await page.getByRole('heading', { name: 'Основа сборки и проверки макетов', exact: true }).waitFor();
  const context = await (await fetch(base + '/api/context')).json();
  assert.match(await page.locator('#app').innerText(), /Общая дизайн-система/);
  assert.match(await page.locator('#app').innerText(), /PRODUCT_GAP/);
  if (context.profile.designSystem?.fileKey) assert.ok(await page.locator(`a[href*="${context.profile.designSystem.fileKey}"]`).count() > 0);
  assert.ok(await page.locator('a[href^="/api/context/evidence?"]').count() > 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.VERIFIER_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.VERIFIER_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.VERIFIER_EVIDENCE_DIR, 'chess-rules-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(process.env.VERIFIER_EVIDENCE_DIR, 'chess-rules-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(process.env.VERIFIER_EVIDENCE_DIR, 'browser-proof.json'), JSON.stringify({
      status: 'PASS', profileId: 'chess', testedAt: new Date().toISOString(),
      scope: 'Runtime UI only: six tabs, empty cases, scoped knowledge, evidence links, note persistence and 390px geometry. Does not certify game design or DS usage.',
      designSystem: { fileKey: context.profile.designSystem?.fileKey, nodeId: context.profile.designSystem?.nodeId, revision: context.profile.designSystem?.revision },
      preflightStatus: context.preflight.status, openGapFields: context.preflight.gaps.map(gap => gap.field),
      checks: { tabs: 6, noPokerArtifactsOnDashboard: true, missingCaseDisabled: true, scopedSourcesVisible: true, productContractNotInferred: context.profile.productContract === null,
        evidenceLinksVisible: true, notePersistedAfterReload: true, horizontalOverflowAt390: false, pageErrors: errors },
      screenshots: ['chess-rules-mobile.png', 'chess-rules-desktop.png']
    }, null, 2) + '\n');
  }
  assert.deepEqual(errors, []);
  if (process.env.VERIFIER_SCREENSHOT) await page.screenshot({ path: process.env.VERIFIER_SCREENSHOT, fullPage: true });
  console.log('PASS: Chess empty UI, all 6 tabs, disabled absent checks, INCOMPLETE, no Poker artifacts on dashboard, note persistence, scoped rules/sources/evidence links, 390px, no JS errors.');
} finally { await browser.close(); await app.close(); }
