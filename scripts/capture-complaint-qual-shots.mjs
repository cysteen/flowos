import { chromium } from 'playwright';
import { mkdir, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const shotsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../PRD/shots');
const ticketUrl = 'http://localhost:3000/flowos/tickets/IFLYTS-20260610-00002';
const out15 = resolve(shotsDir, 'opt-1120-15-投诉定性面板.png');
const out16 = resolve(shotsDir, 'opt-1120-16-需后端推动与需推动问题描述.png');
const out16Legacy = resolve(shotsDir, 'opt-1120-16-需后端推动与推动进展.png');
const out17 = resolve(shotsDir, 'opt-1120-17-投诉分类多组.png');

await mkdir(shotsDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem(
    'flowos_session',
    JSON.stringify({
      account: '13857985858',
      roleKey: 'agent-l2',
      post: 'cs',
      tenantId: 'iflytek',
      remember: true,
    }),
  );
});
const page = await context.newPage();
await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '投诉定性' }).waitFor({ timeout: 60_000 });
await page.getByRole('button', { name: '投诉定性' }).click();

const panel = page.locator('.chip-panel .complaint-categories-block');
await panel.waitFor({ timeout: 30_000 });

// 图 15：未选需后端推动，面板基准态
const pushSelect = panel.locator('.complaint-top-row .cat-item').filter({ hasText: '需后端推动' }).locator('.form-select, .ant-select').first();
await pushSelect.click();
const clear = page.locator('.ant-select-clear').first();
if (await clear.isVisible().catch(() => false)) {
  await clear.click();
  await page.keyboard.press('Escape');
} else {
  await page.keyboard.press('Escape');
}

await panel.screenshot({ path: out15 });

// 图 16：选需后端推动 + 露出「需推动问题描述」
await pushSelect.click();
await page.locator('.ant-select-item-option').filter({ hasText: '产品问题' }).click();
await page.getByText('需推动问题描述', { exact: true }).waitFor({ timeout: 10_000 });
await panel.screenshot({ path: out16 });

// 图 17：添加第二组分类
await panel.getByRole('button', { name: /添加分类/ }).click();
await panel.locator('.complaint-cat-row').nth(2).waitFor({ timeout: 10_000 });
await panel.screenshot({ path: out17 });

await unlink(out16Legacy).catch(() => {});

await browser.close();
console.log('saved', out15, out16, out17);
