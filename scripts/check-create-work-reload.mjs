// Separate Node processes share only a temporary storage file: no router/detail view or browser is opened.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer, loadConfigFromFile } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';

const [mode, dir] = process.argv.slice(2);
if (!mode) {
  const taskDir = mkdtempSync(join(tmpdir(), 'flowos-create-reload-'));
  try {
    for (const entry of ['create', 'workbench', 'query']) {
      const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), entry, taskDir], { cwd: process.cwd(), encoding: 'utf8', timeout: 45000 });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      process.stdout.write(result.stdout);
    }
    console.log('PASS cross-process creation reload: direct workbench and query restore persisted new tickets and source outcome');
  } finally {
    for (const name of ['storage.json', 'expected.json']) { const file = join(taskDir, name); if (existsSync(file)) unlinkSync(file); }
    rmdirSync(taskDir);
  }
} else {
  assert.ok(['create', 'workbench', 'query'].includes(mode));
  const storageFile = join(resolve(dir), 'storage.json');
  const expectedFile = join(resolve(dir), 'expected.json');
  const data = new Map(existsSync(storageFile) ? JSON.parse(readFileSync(storageFile, 'utf8')) : []);
  const persist = () => writeFileSync(storageFile, JSON.stringify([...data]), 'utf8');
  globalThis.localStorage = globalThis.sessionStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); persist(); },
    removeItem: (key) => { data.delete(key); persist(); },
  };
  globalThis.window = globalThis;
  globalThis.addEventListener = globalThis.removeEventListener = () => {};
  globalThis.fetch = async () => { throw new Error('External requests are forbidden'); };
  const timers = new Set();
  const interval = globalThis.setInterval, timeout = globalThis.setTimeout;
  globalThis.setInterval = (...args) => { const id = interval(...args); timers.add(id); return id.unref(); };
  globalThis.setTimeout = (...args) => { const id = timeout(...args); timers.add(id); return id; };
  const { config } = await loadConfigFromFile({ command: 'serve', mode: 'test' }, '.release-build.config.ts');
  const server = await createServer({ ...config, configFile: false, plugins: config.plugins.filter((p) => p?.name !== 'unplugin-vue-components'), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const scope = effectScope();
  try {
    setActivePinia(createPinia());
    const { TICKETS } = await server.ssrLoadModule('/src/mock/tickets.ts');
    const { useUserStore } = await server.ssrLoadModule('/src/stores/user.ts');
    const user = useUserStore(); user.setRole('agent-l2');
    const clone = (value) => JSON.parse(JSON.stringify(value));
    if (mode === 'create') {
      const { TICKET_DETAIL } = await server.ssrLoadModule('/src/mock/ticketDetail.ts');
      const { useCreateWorkItemsStore } = await server.ssrLoadModule('/src/stores/createWorkItems.ts');
      const { submitWorkTicket } = await server.ssrLoadModule('/src/views/tickets/composables/createWorkSubmission.ts');
      const works = useCreateWorkItemsStore();
      const source = TICKETS.find((row) => row.type === '咨询' && !row.flash && !row.refund && !row.xiaozhi && !row.linkedAftersaleNo && !row.aftersaleOriginNo);
      assert.ok(source);
      Object.assign(source, { nodeStatus: '处理中', assignee: user.name, groupId: 'support', closureMode: '正常流程', creationLinks: undefined, escalatedToNo: undefined });
      function ticket(no, type) {
        return { ...clone(source), id: no, no, type, title: `刷新恢复-${type}`, nodeStatus: '处理中', tab: 'mine', createdAt: new Date().toLocaleString('sv-SE'), updatedAt: new Date().toLocaleString('sv-SE'), eventTimeline: [], archived: false };
      }
      const ordinary = ticket('RELOAD-ORDINARY-CS', '咨询');
      submitWorkTicket(works.open({ action: 'create', scene: 'general' }), ordinary, true);
      const transfer = ticket('RELOAD-TRANSFER-CS', '建议');
      const detail = { ...clone(TICKET_DETAIL), no: source.no, type: source.type, source: source.ticketSource || '电话', status: '处理中', lastHandler: source.assignee, groupId: source.groupId, linkedRecords: [], childTickets: [], linkedAftersale: undefined, delegateInfo: null };
      submitWorkTicket(works.open({ action: 'transfer', scene: 'general', source: detail }), transfer, true);
      assert.equal(source.nodeStatus, '已转建议');
      writeFileSync(expectedFile, JSON.stringify({ ordinaryNo: ordinary.no, transferNo: transfer.no, sourceNo: source.no }), 'utf8');
      await nextTick();
      console.log('PASS process create: real creation services persisted ordinary CS and transfer/source links');
    } else {
      const expected = JSON.parse(readFileSync(expectedFile, 'utf8'));
      assert.equal(TICKETS.some((row) => row.no === expected.ordinaryNo), false);
      assert.notEqual(TICKETS.find((row) => row.no === expected.sourceNo)?.nodeStatus, '已转建议');
      // Import only the list entry. Its first snapshot must recover storage without any detail/router call.
      const { useTicketWorkbench } = mode === 'workbench' ? await server.ssrLoadModule('/src/views/tickets/composables/useTicketWorkbench.ts') : {};
      const { useTicketList } = mode === 'query' ? await server.ssrLoadModule('/src/views/tickets/composables/useTicketList.ts') : {};
      const list = scope.run(() => mode === 'workbench' ? useTicketWorkbench() : useTicketList('tenant'));
      for (const no of [expected.ordinaryNo, expected.transferNo]) {
        assert.equal(list.all.value.filter((row) => row.no === no).length, 1);
        if (mode === 'workbench') { list.setSearch(no); assert.ok(list.filtered.value.some((row) => row.no === no)); }
        else { list.keyword.value = no; assert.ok(list.filtered.value.some((row) => row.no === no)); }
      }
      const source = list.all.value.find((row) => row.no === expected.sourceNo);
      assert.equal(source.nodeStatus, '已转建议'); assert.ok(source.creationLinks.some((link) => link.no === expected.transferNo));
      const transfer = list.all.value.find((row) => row.no === expected.transferNo);
      assert.ok(transfer.creationLinks.some((link) => link.no === expected.sourceNo));
      const live = TICKETS.find((row) => row.no === expected.ordinaryNo);
      live.title = '当前会话较新的处理结果'; live.updatedAt = '2099-12-31 23:59:59';
      const { hydrateCreationRows } = await server.ssrLoadModule('/src/stores/creationLedger.ts');
      hydrateCreationRows(); await nextTick();
      assert.equal(live.title, '当前会话较新的处理结果'); assert.equal(TICKETS.filter((row) => row.no === expected.ordinaryNo).length, 1);
      console.log(`PASS fresh ${mode} process: first snapshot/search restores both new rows and bidirectional source result; newer memory survives repeat hydration`);
    }
  } finally {
    scope.stop(); await server.close();
    for (const id of timers) { clearTimeout(id); clearInterval(id); }
  }
}
