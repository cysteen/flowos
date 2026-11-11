import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', '..', 'PRD', 'shots');
const BASE = 'http://localhost:3000/flowos';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem(
      'flowos_session',
      JSON.stringify({
        account: '13965087676',
        roleKey: 'admin',
        post: 'admin',
        tenantId: 'iflytek',
        remember: true,
      }),
    );
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/admin/notify-rules`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('搜索规则名 / 事件').fill('解挂通知');
  await page.waitForTimeout(400);
  const row = page.locator('.ant-table-row').filter({ hasText: '解挂通知' }).first();
  await row.scrollIntoViewIfNeeded();
  await row.screenshot({ path: path.join(OUT, 'opt-1120-21-挂起到期解挂通知规则.png') });

  await page.goto(`${BASE}/tickets/IFLYTS-20260610-00002`, { waitUntil: 'domcontentloaded' });
  await page.locator('button.tab-item', { hasText: '处理履历' }).click({ timeout: 60000 });
  await page.waitForTimeout(800);
  const flowHistory = page.locator('.flow-history');
  await flowHistory.waitFor({ timeout: 30000 });
  await page.locator('.tl-table').getByText('系统自动解除挂起').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await flowHistory.screenshot({ path: path.join(OUT, 'opt-1120-20-挂起到期自动解挂履历.png') });

  await page.locator('button.tab-item', { hasText: '通知记录' }).click();
  await page.waitForTimeout(500);
  const processTabs = page.locator('.process-tabs');
  await processTabs.waitFor({ timeout: 30000 });
  await page.locator('.record-card').filter({ hasText: '解挂通知' }).first().scrollIntoViewIfNeeded();
  await processTabs.screenshot({ path: path.join(OUT, 'opt-1120-22-挂起到期解挂通知记录.png') });

  await browser.close();
  console.log('Saved to', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
