import assert from 'node:assert/strict';
import { createServer, loadConfigFromFile } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const KEY = 'flowos-create-work-items-v1';
const data = new Map();
let blockWorkCache = false;
globalThis.localStorage = globalThis.sessionStorage = {
  getItem: (key) => { if (blockWorkCache && key === KEY) throw new Error('work cache unavailable'); return data.get(key) ?? null; },
  setItem: (key, value) => { data.set(key, value); },
  removeItem: (key) => data.delete(key),
};
globalThis.window = globalThis;
globalThis.addEventListener = globalThis.removeEventListener = () => {};
globalThis.fetch = async () => { throw new Error('External requests are forbidden'); };
const { config } = await loadConfigFromFile({ command: 'serve', mode: 'test' }, 'vite.config.ts');
const server = await createServer({ ...config, configFile:false, plugins:config.plugins.filter((p) => p?.name !== 'unplugin-vue-components'), server:{ middlewareMode:true, hmr:false }, appType:'custom', logLevel:'error' });
try {
  const { useUserStore } = await server.ssrLoadModule('/src/stores/user.ts');
  const { useTicketDraftStore } = await server.ssrLoadModule('/src/stores/ticketDrafts.ts');
  const { useCreateWorkItemsStore } = await server.ssrLoadModule('/src/stores/createWorkItems.ts');
  const { commitCreation, creationReceipt } = await server.ssrLoadModule('/src/stores/creationLedger.ts');
  function freshStores() {
    setActivePinia(createPinia()); useUserStore().setRole('agent-l2');
    return { drafts:useTicketDraftStore(), works:useCreateWorkItemsStore() };
  }
  let cases = 0;
  for (const cache of ['unavailable', 'stale']) for (const kind of ['aftersale', 'ticket']) for (const phase of ['created', 'complete']) {
    blockWorkCache = false;
    const { drafts } = freshStores();
    const id = `receipt-${cache}-${kind}-${phase}`, draftId = `draft-${id}`, no = `${kind}-${phase}`;
    const context = { action:kind === 'aftersale' ? 'aftersale' : 'create', scene:'general' };
    // Simulate the last saved draft/cache from before creation, including an incorrect old work surface.
    drafts.save({ id:draftId, workId:id, title:'先前草稿', typeLabel:'咨询', customerName:'测试客户', savedAt:'2026-11-18', context, form:{ title:'保留输入', ticketType:'咨询' }, aftersaleForm:{ fault:'保留售后输入' }, workStatus:'editing', surface:kind === 'aftersale' ? 'ticket' : 'aftersale' });
    commitCreation(id, { no, kind, phase }, []);
    data.set(KEY, JSON.stringify(cache === 'stale' ? [{ id, owner:'role:agent-l2', identity:`${context.action}:general`, draftId, context, status:'editing', surface:kind === 'aftersale' ? 'ticket' : 'aftersale', savedInput:'', aftersaleOpen:false, form:{ title:'保留输入' } }] : []));
    blockWorkCache = cache === 'unavailable';
    const { works } = freshStores();
    const restored = works.open(context, draftId);
    assert.equal(restored.id, id); assert.equal(restored.resultNo, no);
    assert.equal(restored.status, phase === 'created' ? 'unknown' : 'complete');
    assert.equal(restored.surface, kind === 'aftersale' ? 'aftersale' : 'ticket');
    assert.equal(restored.aftersaleOpen, kind === 'aftersale');
    assert.equal(restored.form.title, '保留输入');
    assert.equal(works.open(context, draftId).id, restored.id);
    assert.equal(works.items.filter((item) => item.id === id).length, 1);
    assert.equal(creationReceipt(id).no, no);
    await nextTick();
    cases++; console.log(`PASS ${cache} work cache / ${kind} ${phase}: receipt restores number, state and surface without duplicate work`);
  }
  console.log(`${cases} receipt recovery cases passed`);
} finally { await server.close(); }
