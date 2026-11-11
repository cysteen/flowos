import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../PRD/shots/opt-1120-14-补充投诉勾选可选.png',
);

await mkdir(dirname(out), { recursive: true });

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
await page.goto('http://localhost:3000/flowos/tickets/IFLYTS-20260817-00001', {
  waitUntil: 'domcontentloaded',
});
await page.getByRole('button', { name: '新建补充' }).waitFor({ timeout: 60_000 });
await page.getByRole('button', { name: '新建补充' }).click();
await page.locator('.supplement-form .ant-select').click();
await page.locator('.ant-select-item-option').filter({ hasText: '补充投诉信息' }).click();
await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
await page.locator('.op-modal-title, .ant-modal-title').first().click();
await page.getByPlaceholder('请简要描述本次补充的信息…').fill('客户再次反馈，分类与渠道未变。');
await page.locator('.ant-modal-content').screenshot({ path: out });
await browser.close();
console.log('saved', out);
