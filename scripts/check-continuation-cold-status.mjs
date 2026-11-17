// A writer opens the real source pages; each reader restores only the unified work URL in a fresh process.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createServer,loadConfigFromFile} from 'vite';
import {createPinia,setActivePinia} from 'pinia';
import {createRenderer,h,nextTick,ssrContextKey} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';

const [mode,dir]=process.argv.slice(2);
if(!mode){
  const taskDir=mkdtempSync(join(tmpdir(),'flowos-cold-continuation-'));
  const run=(action) => {const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),action,taskDir],{cwd:process.cwd(),encoding:'utf8',timeout:45000});assert.equal(r.error,undefined,r.error?.message);assert.equal(r.status,0,r.stdout+r.stderr);process.stdout.write(r.stdout);};
  try{
    run('write');const saved=readFileSync(join(taskDir,'storage.json'));
    for(const action of ['closed','force','literal-closed','active-close-history','active-force-history','changed-after-observation']){writeFileSync(join(taskDir,'storage.json'),saved);run(action);}
    console.log('6 cross-process cold status cases passed');
  }finally{for(const name of ['storage.json','expected.json']){const file=join(taskDir,name);if(existsSync(file))unlinkSync(file);}rmdirSync(taskDir);}
}else{
  const file=join(dir,'storage.json'),expectedFile=join(dir,'expected.json');
  const data=new Map(existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[]);
  const persist=() => writeFileSync(file,JSON.stringify([...data]),'utf8');
  globalThis.localStorage=globalThis.sessionStorage={getItem:(key) => data.get(key) ?? null,setItem:(key,value) => {data.set(key,value);persist();},removeItem:(key) => {data.delete(key);persist();}};
  globalThis.window=globalThis;globalThis.addEventListener=globalThis.removeEventListener=() => {};
  globalThis.fetch=async () => {throw new Error('External requests are forbidden');};
  const timers=new Set(),interval=globalThis.setInterval,timeout=globalThis.setTimeout;
  globalThis.setInterval=(...args) => {const id=interval(...args);timers.add(id);return id.unref();};
  globalThis.setTimeout=(...args) => {const id=timeout(...args);timers.add(id);return id;};
  const {config}=await loadConfigFromFile({command:'serve',mode:'test'},'vite.config.ts');
  const server=await createServer({...config,configFile:false,plugins:config.plugins.filter((p) => p?.name !== 'unplugin-vue-components'),server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  const apps=[];
  try{
    const pinia=createPinia();setActivePinia(pinia);
    const {TICKETS}=await server.ssrLoadModule('/src/mock/tickets.ts');
    const {useUserStore}=await server.ssrLoadModule('/src/stores/user.ts');
    const {useDispatchStore}=await server.ssrLoadModule('/src/stores/dispatch.ts');
    const {useCreateWorkItemsStore}=await server.ssrLoadModule('/src/stores/createWorkItems.ts');
    const {buildReopenTicketPrefill}=await server.ssrLoadModule('/src/views/tickets/composables/childTicketPrefill.ts');
    const service=await server.ssrLoadModule('/src/views/tickets/composables/createWorkSubmission.ts');
    const ledger=await server.ssrLoadModule('/src/stores/creationLedger.ts');
    const component=(await server.ssrLoadModule('/src/views/tickets/components/unified-create/UnifiedCreateForm.vue')).default;
    const {message}=await import('ant-design-vue');for(const key of ['error','success','warning','info'])message[key]=() => {};
    useUserStore().setRole('tenant-admin');useDispatchStore();
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/tickets/:ticketNo',component:{render:() => null}},{path:'/unified-create/:workId',component:{render:() => null}}]});
    const renderer=createRenderer({insert(){},remove(){},createElement:() => ({}),createText:() => ({}),createComment:() => ({}),setText(){},setElementText(){},parentNode:() => null,nextSibling:() => null,patchProp(){}});
    const clone=(value) => JSON.parse(JSON.stringify(value));
    const flush=async () => {await nextTick();await nextTick();await nextTick();};
    const works=useCreateWorkItemsStore();
    const mountWork=(item) => {const app=renderer.createApp({render:() => h({...component,render:() => null},{item})});app.use(pinia);app.use(router);app.provide(ssrContextKey,{});apps.push(app);const root=app.mount({});return root.$.subTree.component.setupState;};
    if(mode === 'write'){
      const closed=TICKETS.find((row) => row.no === 'IFLYZX-20260710-00002');assert.ok(closed);assert.equal(closed.nodeStatus,'处理中');assert.equal(closed.slaText,'—');assert.equal(closed.myCloseAction,true);
      const forced={...clone(closed),id:'cold-force',no:'COLD-FORCE-SOURCE',myCloseAction:false,myForceCloseAction:true};
      const literal={...clone(forced),id:'cold-literal',no:'COLD-LITERAL-SOURCE',nodeStatus:'已关闭'};
      TICKETS.push(forced,literal);
      const {useTicketOperation}=await server.ssrLoadModule('/src/views/tickets/composables/useTicketOperation.ts');
      await router.push(`/tickets/${closed.no}`);let operation;
      const sourceApp=renderer.createApp({setup(){operation=useTicketOperation();return () => null;}});sourceApp.use(pinia);sourceApp.use(router);sourceApp.mount({});apps.push(sourceApp);
      const expected={rows:[clone(forced),clone(literal)],works:{}};
      for(const [kind,row,status] of [['closed',closed,'已关闭'],['force',forced,'已强结'],['literal-closed',literal,'已关闭']]){
        await router.push(`/tickets/${row.no}`);await flush();operation.reloadDetail();assert.equal(operation.detail.value.status,status);
        const detail=clone(operation.detail.value),item=works.open({action:'reopen',scene:'general',source:detail,prefill:buildReopenTicketPrefill(detail)});
        const state=mountWork(item);await flush();state.form.continuationSupplement=`冷恢复补充-${kind}`;state.form.continuationAttachments=['冷恢复附件.png'];await flush();
        expected.works[kind]={id:item.id,no:row.no,status,supplement:state.form.continuationSupplement};
        apps.pop().unmount();
      }
      works.flush();writeFileSync(expectedFile,JSON.stringify(expected),'utf8');console.log('PASS writer: actual closed source and forced/literal-closed fixtures saved work inputs for cold unified URLs');
    }else{
      const expected=JSON.parse(readFileSync(expectedFile,'utf8'));
      for(const row of expected.rows)if(!TICKETS.some((ticket) => ticket.no === row.no))TICKETS.push(row);
      const active=mode.startsWith('active') || mode === 'changed-after-observation';
      const key=mode === 'active-force-history'?'force':active?'closed':mode;
      const info=expected.works[key],item=works.get(info.id);assert.ok(item);assert.equal(item.context.source.status,info.status);assert.equal(ledger.creationReceipt(item.id),undefined);
      const row=TICKETS.find((ticket) => ticket.no === info.no);assert.ok(row);
      if(mode === 'changed-after-observation')service.observeOperationDetail(item.context.source);
      if(active)Object.assign(row,{nodeStatus:'处理中',slaText:'04:00:00',slaSub:'距超时',tab:'mine',updatedAt:'2099-11-18 10:00:00'});
      await router.push(`/unified-create/${item.id}`);const state=mountWork(item);await flush();
      assert.equal(state.form.continuationSupplement,info.supplement);
      assert.equal(service.currentWorkSource(item).detail.status,active?'处理中':info.status);
      const count=TICKETS.length;state.onCreate();await flush();
      if(active){assert.match(item.error,/原单不再满足重新建单/);assert.equal(ledger.creationReceipt(item.id),undefined);assert.equal(TICKETS.length,count);assert.equal(state.form.continuationSupplement,info.supplement);assert.equal(row.nodeStatus,'处理中');}
      else{const receipt=ledger.creationReceipt(item.id);assert.ok(receipt,item.error);assert.equal(receipt.phase,'complete');assert.equal(TICKETS.length,count+1);const child=TICKETS.find((ticket) => ticket.no === receipt.no);assert.ok(child.problemDesc.includes(info.supplement));assert.equal(row.continuationChildNo,child.no);assert.equal(useDispatchStore().ticketStateOf(child.no).relatedNo,row.no);}
      console.log(`PASS fresh unified URL ${mode}: ${active?'live active row blocks stale terminal context, preserves input and creates no receipt':'current stopped-clock normalization permits continuation without source-page cache'}`);
    }
  }finally{for(const app of apps.reverse())app.unmount();await server.close();for(const id of timers){clearTimeout(id);clearInterval(id);}}
}
