import assert from 'node:assert/strict';
import { createServer, loadConfigFromFile } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { createRenderer, h, nextTick, ssrContextKey } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';

const data=new Map();
globalThis.localStorage=globalThis.sessionStorage={ getItem:(key) => data.get(key) ?? null,setItem:(key,value) => data.set(key,value),removeItem:(key) => data.delete(key) };
globalThis.window=globalThis;globalThis.addEventListener=globalThis.removeEventListener=() => {};
globalThis.fetch=async () => {throw new Error('External requests are forbidden');};
const timers=new Set(),interval=globalThis.setInterval,timeout=globalThis.setTimeout;
globalThis.setInterval=(...args) => {const id=interval(...args);timers.add(id);return id.unref();};
globalThis.setTimeout=(...args) => {const id=timeout(...args);timers.add(id);return id;};
const { config }=await loadConfigFromFile({ command:'serve',mode:'test' },'.release-build.config.ts');
const server=await createServer({ ...config,configFile:false,plugins:config.plugins.filter((p) => p?.name !== 'unplugin-vue-components'),server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error' });
let sourceApp;
const apps=[];
try {
  const pinia=createPinia();setActivePinia(pinia);
  const { TICKETS }=await server.ssrLoadModule('/src/mock/tickets.ts');
  const { useUserStore }=await server.ssrLoadModule('/src/stores/user.ts');
  const { useTicketOperation }=await server.ssrLoadModule('/src/views/tickets/composables/useTicketOperation.ts');
  const { useCreateWorkItemsStore }=await server.ssrLoadModule('/src/stores/createWorkItems.ts');
  const { buildEscalatePrefill }=await server.ssrLoadModule('/src/views/tickets/composables/complaintEscalation.ts');
  const { CREATE_COMPLAINT_L2_MAP }=await server.ssrLoadModule('/src/views/tickets/types/complaintCreateCategory.ts');
  const ledger=await server.ssrLoadModule('/src/stores/creationLedger.ts');
  const component=(await server.ssrLoadModule('/src/views/tickets/components/unified-create/UnifiedCreateForm.vue')).default;
  const { message }=await import('ant-design-vue');for(const key of ['success','warning','error','info'])message[key]=() => {};
  useUserStore().setRole('complaint-handler');
  const { useDispatchStore }=await server.ssrLoadModule('/src/stores/dispatch.ts');useDispatchStore();
  const source=TICKETS.find((row) => row.no === 'IFLYTS-20260923-00061');assert.ok(source);assert.equal(source.businessType,undefined);assert.equal(source.sn,undefined);assert.equal(source.problemL1,undefined);
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/tickets/:ticketNo',component:{render:() => null}}]});await router.push(`/tickets/${source.no}`);
  const renderer=createRenderer({insert(){},remove(){},createElement:() => ({}),createText:() => ({}),createComment:() => ({}),setText(){},setElementText(){},parentNode:() => null,nextSibling:() => null,patchProp(){}});
  let operation;sourceApp=renderer.createApp({setup(){operation=useTicketOperation();return () => null;}});sourceApp.use(pinia);sourceApp.use(router);sourceApp.mount({});await nextTick();
  const clone=(value) => JSON.parse(JSON.stringify(value));
  const baseRow=clone(source),baseDetail=clone(operation.detail.value);
  assert.equal(baseDetail.no,source.no);assert.equal(baseDetail.source,'内投渠道');assert.ok(baseDetail.businessType);assert.ok(baseDetail.product.sn);assert.equal(baseDetail.product.issueTags.length,3);
  const works=useCreateWorkItemsStore();
  const categories=Object.entries(CREATE_COMPLAINT_L2_MAP).filter(([,rows]) => rows.length).slice(0,2).map(([cat1,rows]) => ({cat1,cat2:rows[0]}));
  const platforms=[{platform:'其他',customPlatform:'坐席填写平台一',complaintNo:'PLATFORM-ONE'},{platform:'其他',customPlatform:'坐席填写平台二',complaintNo:'PLATFORM-TWO'}];
  const flush=async () => {await nextTick();await nextTick();await nextTick();};
  const cases=['actual-sparse-seed','missing-phone-and-category','row-precedence','explicit-clear'];
  for(const [index,mode] of cases.entries()) {
    const row=index === 0 ? source : {...clone(baseRow),id:`external-source-${index}`,no:`EXTERNAL-SOURCE-${index}`};
    const detail={...clone(baseDetail),no:row.no};
    if(mode === 'missing-phone-and-category') {delete row.customerPhone;delete row.productCategory;}
    if(mode === 'row-precedence') Object.assign(row,{customerPhone:'13600000000',customerRegion:'行级地区',customerAddress:'行级地址',productCategory:'行级分类',sn:'ROW-SN',businessType:'行级业务',businessLine:'行级业务线',problemL1:'行级一类',problemL2:'行级二类',problemL3:'行级三类'});
    if(mode === 'explicit-clear') Object.assign(row,{customerPhone:'',customerRegion:'',customerAddress:'',productCategory:'',sn:'',businessType:'',businessLine:'',problemL1:'',problemL2:'',problemL3:''});
    if(index)TICKETS.push(row);
    const expected={customer:row.customer,customerPhone:row.customerPhone ?? detail.customer.contacts.find((c) => c.type === 'phone')?.value,customerRegion:row.customerRegion ?? detail.customer.region,customerAddress:row.customerAddress ?? detail.customer.address,product:row.product,productCategory:row.productCategory ?? detail.product.category,sn:row.sn ?? detail.product.sn,businessType:row.businessType ?? detail.businessType,businessLine:row.businessLine ?? detail.businessLine,problemL1:row.problemL1 ?? detail.product.issueTags[0],problemL2:row.problemL2 ?? detail.product.issueTags[1],problemL3:row.problemL3 ?? detail.product.issueTags[2]};
    const item=works.open({action:'escalateExternal',scene:'general',source:detail,prefill:buildEscalatePrefill(detail,'external')});
    const app=renderer.createApp({render:() => h({...component,render:() => null},{item})});apps.push(app);app.use(pinia);app.use(router);app.provide(ssrContextKey,{});
    const root=app.mount({}),state=root.$.subTree.component.setupState;await flush();
    state.form.externalComplaintCategories=clone(categories);state.form.complaintPlatforms=clone(platforms);state.form.description='坐席填写的新外投描述';state.form.descriptionAttachments=['本次外投附件.png'];
    const count=TICKETS.length;state.onCreate();await flush();
    const receipt=ledger.creationReceipt(item.id);assert.ok(receipt,item.error);assert.equal(receipt.phase,'complete');assert.equal(TICKETS.length,count+1);
    ledger.hydrateCreationRows();const created=TICKETS.find((ticket) => ticket.no === receipt.no);
    for(const [key,value] of Object.entries(expected)) assert.equal(created[key],value === '' ? undefined : value,`${mode} / ${key}`);
    assert.deepEqual(created.externalComplaintCategories,categories);assert.deepEqual(created.complaintPlatforms,platforms);assert.equal(created.complaintL1,categories[0].cat1);assert.equal(created.complaintL2,categories[0].cat2);
    assert.ok(created.problemDesc.includes('坐席填写的新外投描述'));assert.deepEqual(created.problemDescAttachments,['本次外投附件.png']);assert.equal(created.ticketSource,'外投渠道');assert.equal(created.type,'投诉');
    assert.equal(created.title,`外投·${row.title}`);assert.equal(row.nodeStatus,'已升级外投');
    await router.push(`/tickets/${created.no}`);await flush();operation.reloadDetail();
    assert.equal(operation.detail.value.businessType,created.businessType || '—');assert.equal(operation.detail.value.businessLine,created.businessLine || '—');assert.equal(operation.detail.value.product.sn,created.sn || '—');
    assert.deepEqual(operation.detail.value.product.issueTags,[created.problemL1,created.problemL2,created.problemL3].filter(Boolean));
    app.unmount();apps.pop();console.log(`PASS actual simplified onCreate ${mode}: readonly identity survives persistence/reopen, newly filled categories/platforms/description/attachments stay intact`);
  }
  console.log('4 simplified external source inheritance cases passed');
} finally {for(const app of apps)app.unmount();sourceApp?.unmount();await server.close();for(const id of timers){clearTimeout(id);clearInterval(id);}}
