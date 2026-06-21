<script setup lang="ts">
import { ref, computed } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, AppstoreOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue';

// 产品管理（PRD-85）：产品分类树 + 产品列表（SN 规则 / 保修 / 售后能力，控转售后）。
interface Cat { key: string; name: string; count: number; }
interface Product {
  id: string; name: string; model: string; cat: string; snRule: string;
  warranty: string; aftersale: boolean; status: '在售' | '停售';
}
const cats = ref<Cat[]>([
  { key: 'all', name: '全部产品', count: 9 },
  { key: 'smart', name: '智能硬件', count: 4 },
  { key: 'app', name: '软件服务', count: 3 },
  { key: 'acc', name: '配件耗材', count: 2 },
]);
const selected = ref('all');

const products = ref<Product[]>([
  { id: 'P01', name: '翻译机 3.0 Pro', model: 'TR-300P', cat: 'smart', snRule: 'TR3+12位', warranty: '12 个月', aftersale: true, status: '在售' },
  { id: 'P02', name: '录音笔 SR502', model: 'SR-502', cat: 'smart', snRule: 'SR+10位', warranty: '12 个月', aftersale: true, status: '在售' },
  { id: 'P03', name: '智能办公本 X2', model: 'NB-X2', cat: 'smart', snRule: 'NBX+14位', warranty: '24 个月', aftersale: true, status: '在售' },
  { id: 'P04', name: '会议宝 M1', model: 'MT-M1', cat: 'smart', snRule: 'MTM+12位', warranty: '12 个月', aftersale: false, status: '停售' },
  { id: 'P05', name: '语音转写服务', model: 'SVC-ASR', cat: 'app', snRule: '订阅号', warranty: '订阅期内', aftersale: false, status: '在售' },
  { id: 'P06', name: '翻译 API 套餐', model: 'SVC-MT', cat: 'app', snRule: 'API Key', warranty: '订阅期内', aftersale: false, status: '在售' },
  { id: 'P07', name: '云存储扩容', model: 'SVC-STG', cat: 'app', snRule: '订阅号', warranty: '订阅期内', aftersale: false, status: '在售' },
  { id: 'P08', name: '原装充电器', model: 'AC-01', cat: 'acc', snRule: '无', warranty: '3 个月', aftersale: true, status: '在售' },
  { id: 'P09', name: '保护套', model: 'CS-01', cat: 'acc', snRule: '无', warranty: '无', aftersale: false, status: '在售' },
]);
const list = computed(() => selected.value === 'all' ? products.value : products.value.filter((p) => p.cat === selected.value));
const cols = [
  { title: '产品名称', dataIndex: 'name', key: 'name', width: 180 },
  { title: '型号', dataIndex: 'model', key: 'model', width: 120 },
  { title: 'SN 规则', dataIndex: 'snRule', key: 'snRule', width: 130 },
  { title: '保修期', dataIndex: 'warranty', key: 'warranty', width: 110 },
  { title: '可转售后', dataIndex: 'aftersale', key: 'aftersale', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '操作', key: 'op', width: 100 },
];
function todo(t: string) { message.info(`「${t}」（演示）`); }
</script>

<template>
  <div class="product-manage">
    <div class="left">
      <div class="panel-head"><span>产品分类</span><a-button type="primary" size="small" @click="todo('新增分类')"><template #icon><PlusOutlined /></template>新增</a-button></div>
      <div class="cat-list">
        <div v-for="c in cats" :key="c.key" class="cat-item" :class="{ on: c.key === selected }" @click="selected = c.key">
          <span><AppstoreOutlined /> {{ c.name }}</span><span class="cnt">{{ c.count }}</span>
        </div>
      </div>
    </div>
    <div class="right">
      <div class="panel-head">
        <span>产品列表</span>
        <a-button type="primary" size="small" @click="todo('新增产品')"><template #icon><PlusOutlined /></template>新增产品</a-button>
      </div>
      <a-table :columns="cols" :data-source="list" row-key="id" :pagination="false" size="middle">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'snRule'" class="mono">{{ record.snRule }}</span>
          <template v-else-if="column.key === 'aftersale'">
            <a-tag :color="record.aftersale ? 'green' : 'default'">{{ record.aftersale ? '可转售后' : '不可' }}</a-tag>
          </template>
          <a-tag v-else-if="column.key === 'status'" :color="record.status === '在售' ? 'blue' : 'default'">{{ record.status }}</a-tag>
          <template v-else-if="column.key === 'op'">
            <EditOutlined class="op-ic" @click="todo('编辑')" /><DeleteOutlined class="op-ic danger" @click="todo('删除')" />
          </template>
        </template>
      </a-table>
      <div class="tip">「可转售后」控制工单操作页「转售后」按钮是否可用；保修期与 SN 规则用于受理时自动带出保修状态。</div>
    </div>
  </div>
</template>

<style scoped>
.product-manage { display: flex; gap: 16px; padding: 16px 24px; align-items: flex-start; }
.left { width: 240px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.right { flex: 1; min-width: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; color: #111827; }
.cat-list { padding: 8px; }
.cat-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 7px; cursor: pointer; font-size: 13px; color: #4b5563; }
.cat-item:hover { background: #f9fafb; }
.cat-item.on { background: #eff6ff; color: #1a6fff; font-weight: 600; }
.cnt { font-size: 12px; color: #9ca3af; }
.cat-item.on .cnt { color: #1a6fff; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; color: #6b7280; }
.op-ic { color: #6b7280; cursor: pointer; margin-right: 12px; } .op-ic.danger { color: #ef4444; } .op-ic:hover { opacity: 0.7; }
.tip { font-size: 12px; color: #6b7280; background: #f9fafb; border-top: 1px solid #f0f0f0; padding: 10px 16px; line-height: 1.6; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
