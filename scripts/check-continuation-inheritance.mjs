import assert from 'node:assert/strict';
import { createServer, loadConfigFromFile } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { createRenderer, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';

const data = new Map();
globalThis.localStorage = globalThis.sessionStorage = { getItem:(key) => data.get(key) ?? null, setItem:(key,value) => data.set(key,value), removeItem:(key) => data.delete(key) };
globalThis.window = globalThis;
globalThis.addEventListener = globalThis.removeEventListener = () => {};
globalThis.fetch = async () => { throw new Error('External requests are forbidden'); };
const timers = new Set(), interval = globalThis.setInterval, timeout = globalThis.setTimeout;
globalThis.setInterval = (...args) => { const id=interval(...args);timers.add(id);return id.unref(); };
globalThis.setTimeout = (...args) => { const id=timeout(...args);timers.add(id);return id; };
const { config } = await loadConfigFromFile({ command:'serve', mode:'test' }, '.release-build.config.ts');
const server = await createServer({ ...config, configFile:false, plugins:config.plugins.filter((p) => p?.name !== 'unplugin-vue-components'), server:{ middlewareMode:true, hmr:false }, appType:'custom', logLevel:'error' });
let app;
try {
  const pinia=createPinia();setActivePinia(pinia);
  const { TICKETS }=await server.ssrLoadModule('/src/mock/tickets.ts');
  const { useUserStore }=await server.ssrLoadModule('/src/stores/user.ts');
  const { useDispatchStore }=await server.ssrLoadModule('/src/stores/dispatch.ts');
  const { useCreateWorkItemsStore }=await server.ssrLoadModule('/src/stores/createWorkItems.ts');
  const { useTicketOperation }=await server.ssrLoadModule('/src/views/tickets/composables/useTicketOperation.ts');
  const service=await server.ssrLoadModule('/src/views/tickets/composables/createWorkSubmission.ts');
  const ledger=await server.ssrLoadModule('/src/stores/creationLedger.ts');
  useUserStore().setRole('tenant-admin');
  const source=TICKETS.find((row) => row.no === 'IFLYSJ-20260818-00004'); assert.ok(source);
  const router=createRouter({ history:createMemoryHistory(), routes:[{ path:'/tickets/:ticketNo', component:{ render:() => null } }] });
  await router.push(`/tickets/${source.no}`);
  const renderer=createRenderer({ insert(){},remove(){},createElement:() => ({}),createText:() => ({}),createComment:() => ({}),setText(){},setElementText(){},parentNode:() => null,nextSibling:() => null,patchProp(){} });
  let operation;
  app=renderer.createApp({ setup(){ operation=useTicketOperation();return () => null; } });app.use(pinia);app.use(router);app.mount({});await nextTick();
  const clone=(value) => JSON.parse(JSON.stringify(value));
  const detail=clone(operation.detail.value);
  assert.equal(detail.no,source.no); assert.equal(source.businessType,undefined);assert.equal(source.sn,undefined);assert.equal(source.problemL1,undefined);
  assert.equal(detail.businessType,'学习机');assert.equal(detail.businessLine,'学习机业务线');assert.equal(detail.product.sn,'K710A240915001234');assert.deepEqual(detail.product.issueTags,['功能异常','播放问题','在线播放']);
  const works=useCreateWorkItemsStore();
  let seq=0;
  function submit(row, sourceDetail) {
    const item=works.open({ action:'reopen',scene:'general',source:sourceDetail });item.form={ continuationSupplement:'本次追加诉求',continuationAttachments:['新增.png'] };
    const ticket={ ...clone(row),id:`new-continuation-${++seq}`,no:`CONTINUATION-CHECK-${seq}`,createdAt:'2026-11-18 10:00:00',updatedAt:'2026-11-18 10:00:00',businessType:'不能保留表单覆盖值',sn:'WRONG-SN',eventTimeline:[] };
    service.submitWorkTicket(item,ticket,true);return TICKETS.find((entry) => entry.no === ticket.no);
  }
  const child=submit(source,detail);
  assert.equal(child.businessType,detail.businessType);assert.equal(child.businessLine,detail.businessLine);assert.equal(child.sn,detail.product.sn);
  assert.deepEqual([child.problemL1,child.problemL2,child.problemL3],detail.product.issueTags);
  assert.equal(child.ticketSource,detail.source);assert.equal(child.customerRegion,detail.customer.region);assert.equal(child.customerAddress,detail.customer.address);
  assert.equal(child.title,source.title);assert.equal(child.type,source.type);assert.equal(child.priority,source.priority);
  const dispatch=useDispatchStore(),dispatchState=dispatch.ticketStateOf(child.no);assert.ok(dispatchState);assert.equal(dispatchState.relatedNo,source.no);
  assert.equal(child.groupId,dispatch.poolGroupIdOf(dispatchState.poolId));assert.ok(dispatch.logsOf(child.no).length > 0);assert.equal(source.nodeStatus,'已结案');
  assert.equal(source.businessType,undefined);assert.equal(source.sn,undefined);assert.equal(child.creationSla.customer.solveElapsedMs,0);assert.equal(child.creationSla.inheritedFromNo,undefined);
  ledger.hydrateCreationRows();await router.push(`/tickets/${child.no}`);await nextTick();operation.reloadDetail();
  const reopened=operation.detail.value;
  assert.equal(reopened.businessType,detail.businessType);assert.equal(reopened.businessLine,detail.businessLine);assert.equal(reopened.product.sn,detail.product.sn);assert.deepEqual(reopened.product.issueTags,detail.product.issueTags);
  console.log('PASS actual IFLYSJ-20260818-00004: sparse historical row inherits its current detail; persisted child detail reopens with business/line/SN/path intact');

  function anotherSource(extra) {
    const row={ ...clone(source),...extra,id:`origin-${seq+1}`,no:`ORIGIN-${seq+1}`,continuationChildNo:undefined,creationLinks:undefined,eventTimeline:[] };TICKETS.push(row);
    return { row,detail:{ ...clone(detail),no:row.no,childTickets:[],linkedRecords:[] } };
  }
  const current=anotherSource({ businessType:'行级业务',businessLine:'行级业务线',sn:'ROW-SN',problemL1:'行级一类',problemL2:'行级二类',problemL3:'行级三类',customerRegion:'行级地区',customerAddress:'行级地址',ticketSource:'IM',problemDesc:'行级原描述',problemDescAttachments:['原附件.png'] });
  const currentChild=submit(current.row,current.detail);
  for(const key of ['businessType','businessLine','sn','problemL1','problemL2','problemL3','customerRegion','customerAddress','ticketSource']) assert.equal(currentChild[key],current.row[key]);
  assert.equal(currentChild.problemDesc,'行级原描述\n\n本次追加诉求');assert.deepEqual(currentChild.problemDescAttachments,['原附件.png','新增.png']);
  console.log('PASS current row values take precedence over older source-detail values; original and new attachments are preserved');

  const absent=anotherSource({ businessType:undefined,businessLine:undefined,sn:'',problemL1:undefined,problemL2:undefined,problemL3:undefined,problemDesc:undefined,problemDescAttachments:undefined });
  Object.assign(absent.detail,{ businessType:'—',businessLine:'',demand:'—',demandAttachments:['详情附件.png'] });absent.detail.product.sn='不应回填已清空SN';absent.detail.product.issueTags=[];
  const absentChild=submit(absent.row,absent.detail);
  for(const key of ['businessType','businessLine','sn','problemL1','problemL2','problemL3']) assert.equal(absentChild[key],undefined);
  assert.equal(absentChild.problemDesc,'本次追加诉求');assert.deepEqual(absentChild.problemDescAttachments,['详情附件.png','新增.png']);
  console.log('PASS missing facts stay empty, placeholders never become business values, explicit row clears are respected and source-detail attachments survive');
} finally { app?.unmount();await server.close();for(const id of timers){clearTimeout(id);clearInterval(id);} }
