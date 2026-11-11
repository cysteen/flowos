import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../PRD/shots');
const outList = resolve(dir, 'opt-1120-18-建议下送感谢短信规则.png');
const outModal = resolve(dir, 'opt-1120-19-建议下送感谢短信模板.png');

await mkdir(dir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem(
    'flowos_session',
    JSON.stringify({
      account: '18756826666',
      roleKey: 'ops-admin',
      tenantId: 'iflytek',
      remember: true,
    }),
  );
});
const page = await context.newPage();
await page.goto('http://localhost:3000/flowos/admin/notify-rules', {
  waitUntil: 'domcontentloaded',
});
await page.getByText('建议工单下送感谢短信').first().waitFor({ timeout: 60_000 });
const row = page.locator('tr').filter({ hasText: '建议工单下送感谢短信' });
await row.screenshot({ path: outList });

await row.getByRole('button', { name: '编辑' }).click();
await page.getByText('新建通知规则').or(page.getByText('编辑通知规则')).first().waitFor({ timeout: 15_000 });
await page.locator('.ant-modal-content').screenshot({ path: outModal });

await browser.close();
console.log('saved', outList, outModal);
