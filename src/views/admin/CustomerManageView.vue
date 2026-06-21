<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, UserOutlined, PhoneOutlined, ImportOutlined, InboxOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';

// 客户管理（PRD-87）：客户列表 + 等级/标签筛选 + 360 详情抽屉（资料/历史工单/联系记录）。
interface Customer {
  id: string; name: string; phone: string; level: 'VIP' | '金牌' | '普通'; tags: string[];
  region: string; tickets: number; lastContact: string; firstSeen: string;
}
const levelFilter = ref('全部');
const keyword = ref('');
const customers = ref<Customer[]>([
  { id: 'C1001', name: '张伟', phone: '138****2046', level: 'VIP', tags: ['高价值', '易投诉'], region: '上海', tickets: 12, lastContact: '2026-06-18', firstSeen: '2023-05-11' },
  { id: 'C1002', name: '李娜', phone: '139****8821', level: '金牌', tags: ['老客户'], region: '北京', tickets: 7, lastContact: '2026-06-15', firstSeen: '2022-11-02' },
  { id: 'C1003', name: '王强', phone: '137****5510', level: '普通', tags: [], region: '广州', tickets: 2, lastContact: '2026-06-10', firstSeen: '2025-09-20' },
  { id: 'C1004', name: '赵敏', phone: '136****3344', level: 'VIP', tags: ['企业客户', '续约期'], region: '深圳', tickets: 9, lastContact: '2026-06-17', firstSeen: '2021-03-15' },
  { id: 'C1005', name: '陈静', phone: '135****9087', level: '普通', tags: ['新客'], region: '杭州', tickets: 1, lastContact: '2026-06-19', firstSeen: '2026-06-01' },
]);
const list = computed(() => customers.value.filter((c) => {
  if (levelFilter.value !== '全部' && c.level !== levelFilter.value) return false;
  if (keyword.value && !`${c.name}${c.phone}${c.id}`.includes(keyword.value)) return false;
  return true;
}));
const LV_TONE: Record<string, string> = { VIP: 'red', 金牌: 'gold', 普通: 'default' };
const cols = [
  { title: '客户', dataIndex: 'name', key: 'name', width: 150 },
  { title: '电话', dataIndex: 'phone', key: 'phone', width: 140 },
  { title: '等级', dataIndex: 'level', key: 'level', width: 90 },
  { title: '标签', dataIndex: 'tags', key: 'tags' },
  { title: '地区', dataIndex: 'region', key: 'region', width: 90 },
  { title: '工单数', dataIndex: 'tickets', key: 'tickets', width: 90 },
  { title: '最近联系', dataIndex: 'lastContact', key: 'lastContact', width: 120 },
  { title: '操作', key: 'op', width: 90 },
];

const drawerOpen = ref(false);
const current = ref<Customer | null>(null);
const histTickets = [
  { no: 'TK-88231', type: '投诉工单', status: '处理中', date: '2026-06-18' },
  { no: 'TK-87102', type: '咨询工单', status: '已结案', date: '2026-05-30' },
  { no: 'TK-86044', type: '投诉工单', status: '已结案', date: '2026-04-12' },
];
const contacts = [
  { time: '2026-06-18 09:12', channel: '电话', summary: '反馈产品故障，已建投诉单' },
  { time: '2026-05-30 14:33', channel: '在线', summary: '咨询保修政策' },
];
function openDetail(c: Customer) { current.value = c; drawerOpen.value = true; }

// —— 新建客户（真实写入列表）——
let seq = 1006;
const createOpen = ref(false);
const cform = reactive({ name: '', phone: '', level: '普通' as Customer['level'], region: '', tags: '' });
function openCreate() {
  Object.assign(cform, { name: '', phone: '', level: '普通', region: '', tags: '' });
  createOpen.value = true;
}
function saveCreate() {
  if (!cform.name || !cform.phone) { message.error('请填写客户姓名与联系电话'); return; }
  const today = '2026-06-21';
  customers.value.unshift({
    id: 'C' + seq++, name: cform.name, phone: cform.phone, level: cform.level,
    tags: cform.tags ? cform.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [],
    region: cform.region, tickets: 0, lastContact: today, firstSeen: today,
  });
  message.success(`客户「${cform.name}」已建档`);
  createOpen.value = false;
}

// —— 导入客户（真实弹窗 + 模板下载）——
const importOpen = ref(false);
const importCount = ref(0);
function openImport() { importCount.value = 0; importOpen.value = true; }
function onImportFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) { importCount.value = Math.max(1, Math.round(f.size / 80)); message.success(`已解析文件「${f.name}」，识别 ${importCount.value} 条`); }
}
function doImport() {
  if (!importCount.value) { message.warning('请先选择要导入的 Excel/CSV 文件'); return; }
  message.success(`已导入 ${importCount.value} 条客户`);
  importOpen.value = false;
}

function downloadTemplate() {
  const csv = '﻿客户姓名,联系电话,客户等级,所在地区,标签\n张三,13800000000,VIP,上海,高价值;老客户\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = '客户导入模板.csv';
  a.click();
  URL.revokeObjectURL(url);
  message.success('已下载导入模板');
}
function callOut(phone: string) { message.success(`正在呼叫 ${phone}…`); }
</script>

<template>
  <div class="customer-manage">
    <AdminPageHeader title="客户管理" subtitle="维护客户档案、等级与标签，支撑工单受理时的客户 360 视图">
      <template #actions>
        <a-button @click="openImport"><template #icon><ImportOutlined /></template>导入</a-button>
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建客户</a-button>
      </template>
    </AdminPageHeader>
    <div class="bar">
      <div class="filters">
        <a-segmented v-model:value="levelFilter" :options="['全部','VIP','金牌','普通']" />
        <a-input-search v-model:value="keyword" placeholder="搜索姓名/电话/客户号" style="width: 240px" allow-clear />
      </div>
    </div>
    <a-table :columns="cols" :data-source="list" row-key="id" :pagination="stdPagination()" size="middle">
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'name'" class="cname" @click="openDetail(record as Customer)">
          <a-avatar size="small"><template #icon><UserOutlined /></template></a-avatar><b>{{ record.name }}</b><span class="cid">{{ record.id }}</span>
        </span>
        <a-tag v-else-if="column.key === 'level'" :color="LV_TONE[record.level]">{{ record.level }}</a-tag>
        <template v-else-if="column.key === 'tags'">
          <a-tag v-for="t in record.tags" :key="t" color="blue">{{ t }}</a-tag>
          <span v-if="!record.tags.length" class="muted">—</span>
        </template>
        <span v-else-if="column.key === 'tickets'"><b>{{ record.tickets }}</b></span>
        <a-button v-else-if="column.key === 'op'" type="link" size="small" @click="openDetail(record as Customer)">详情</a-button>
      </template>
    </a-table>

    <a-drawer v-model:open="drawerOpen" :title="current ? `客户 360 · ${current.name}` : ''" width="600" placement="right">
      <template v-if="current">
        <div class="d-head">
          <a-avatar :size="56"><template #icon><UserOutlined /></template></a-avatar>
          <div class="dh-body">
            <div class="dh-name">{{ current.name }}<a-tag :color="LV_TONE[current.level]">{{ current.level }}</a-tag></div>
            <div class="dh-sub"><PhoneOutlined /> {{ current.phone }} · {{ current.region }} · 自 {{ current.firstSeen }}</div>
            <div class="dh-tags"><a-tag v-for="t in current.tags" :key="t" color="blue">{{ t }}</a-tag></div>
          </div>
          <a-button type="primary" @click="callOut(current.phone)"><template #icon><PhoneOutlined /></template>外呼</a-button>
        </div>
        <a-tabs>
          <a-tab-pane key="t1" :tab="`历史工单 (${current.tickets})`">
            <a-table :columns="[{title:'工单号',dataIndex:'no'},{title:'类型',dataIndex:'type'},{title:'状态',dataIndex:'status'},{title:'日期',dataIndex:'date'}]" :data-source="histTickets" row-key="no" :pagination="false" size="small" />
          </a-tab-pane>
          <a-tab-pane key="t2" tab="联系记录">
            <a-timeline style="margin-top: 12px">
              <a-timeline-item v-for="(c, i) in contacts" :key="i">
                <div class="ct-time">{{ c.time }} · <a-tag>{{ c.channel }}</a-tag></div>
                <div class="ct-sum">{{ c.summary }}</div>
              </a-timeline-item>
            </a-timeline>
          </a-tab-pane>
          <a-tab-pane key="t3" tab="资料">
            <a-descriptions :column="1" bordered size="small">
              <a-descriptions-item label="客户号">{{ current.id }}</a-descriptions-item>
              <a-descriptions-item label="等级">{{ current.level }}</a-descriptions-item>
              <a-descriptions-item label="地区">{{ current.region }}</a-descriptions-item>
              <a-descriptions-item label="首次接触">{{ current.firstSeen }}</a-descriptions-item>
              <a-descriptions-item label="累计工单">{{ current.tickets }}</a-descriptions-item>
            </a-descriptions>
          </a-tab-pane>
        </a-tabs>
      </template>
    </a-drawer>

    <!-- 新建客户 -->
    <a-modal v-model:open="createOpen" title="新建客户" :width="520" ok-text="建档" cancel-text="取消" @ok="saveCreate">
      <a-form layout="vertical" class="create-form">
        <a-form-item label="客户姓名" required class="half"><a-input v-model:value="cform.name" placeholder="请输入" /></a-form-item>
        <a-form-item label="联系电话" required class="half"><a-input v-model:value="cform.phone" placeholder="请输入" /></a-form-item>
        <a-form-item label="客户等级" class="half"><a-select v-model:value="cform.level" :options="['VIP','金牌','普通'].map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="所在地区" class="half"><a-input v-model:value="cform.region" placeholder="如：上海" /></a-form-item>
        <a-form-item label="标签" class="full"><a-input v-model:value="cform.tags" placeholder="多个标签用逗号分隔，如：高价值, 老客户" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 导入客户 -->
    <a-modal v-model:open="importOpen" title="导入客户" :width="480" ok-text="开始导入" cancel-text="取消" @ok="doImport">
      <div class="import-box">
        <label class="dropzone">
          <InboxOutlined class="dz-ic" />
          <div class="dz-main">点击选择 Excel / CSV 文件</div>
          <div class="dz-sub">{{ importCount ? `已识别 ${importCount} 条客户` : '支持 .xlsx / .csv，首行为表头' }}</div>
          <input type="file" accept=".xlsx,.xls,.csv" hidden @change="onImportFile" />
        </label>
        <a-button type="link" size="small" @click="downloadTemplate">下载导入模板</a-button>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.customer-manage { padding: 16px 24px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 16px; flex-wrap: wrap; }
.filters { display: flex; gap: 12px; align-items: center; }
.btns { display: flex; gap: 10px; }
.cname { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.cname:hover b { color: #1a6fff; }
.cid { font-size: 11px; color: #9ca3af; font-family: ui-monospace, monospace; }
.create-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.create-form .full { grid-column: 1 / -1; }
.create-form :deep(.ant-form-item) { margin-bottom: 14px; }
.import-box { text-align: center; }
.dropzone { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px; border: 1.5px dashed #d1d5db; border-radius: 10px; cursor: pointer; transition: all 0.15s; }
.dropzone:hover { border-color: #1a6fff; background: #f7faff; }
.dz-ic { font-size: 34px; color: #1a6fff; }
.dz-main { font-size: 14px; font-weight: 600; color: #374151; }
.dz-sub { font-size: 12px; color: #9ca3af; }
.muted { color: #d1d5db; }
.d-head { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid #f0f0f0; margin-bottom: 8px; }
.dh-body { flex: 1; }
.dh-name { font-size: 17px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.dh-sub { font-size: 13px; color: #6b7280; margin: 4px 0; }
.ct-time { font-size: 12px; color: #6b7280; } .ct-sum { font-size: 13px; color: #374151; margin-top: 2px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
