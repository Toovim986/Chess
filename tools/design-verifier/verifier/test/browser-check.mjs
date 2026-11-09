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
const tabs = ['Главная', 'Макеты', 'Карта передачи', 'Дизайн-система'];
try {
  await page.goto(base); await page.getByText('Ревизий пока нет.').first().waitFor();
  // Chess shows only the four picture-first views; Poker archive tools stay hidden.
  assert.deepEqual(await page.locator('.navigation [data-view]:visible').allInnerTexts(), tabs);
  assert.equal(await page.locator('img[src^="/evidence/"]').count(), 0);
  for (const name of tabs) await page.getByRole('button', { name, exact: true }).click();
  await page.locator('.cw-details summary', { hasText: 'Правила процесса' }).click();
  const context = await (await fetch(base + '/api/context')).json();
  assert.match(await page.locator('#app').innerText(), new RegExp(context.activeRules[0].id));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="menu"]').click();
  await page.getByRole('button', { name: 'Главная', exact: true }).click();
  assert.equal(await page.locator('[data-action="menu"]').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  if (process.env.VERIFIER_SCREENSHOT) await page.screenshot({ path: process.env.VERIFIER_SCREENSHOT, fullPage: true });
  console.log('PASS: Chess empty UI, four tabs, empty states, rules visible, 390px, no JS errors.');
} finally { await browser.close(); await app.close(); }
