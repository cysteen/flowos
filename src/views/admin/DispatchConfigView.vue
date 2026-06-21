<script setup lang="ts">
import { ref, reactive } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, DeleteOutlined, ThunderboltOutlined, TeamOutlined, AimOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';

// 智能分派（PRD-90，V1 D1-dispatch）：分派策略 + 规则链 + 工单池 + 兜底。
const strategy = ref<'skill' | 'load' | 'round' | 'manual'>('skill');
const STRATEGIES = [
  { key: 'skill', label: '技能优先', icon: AimOutlined, desc: '按工单类型/技能标签匹配最合适的坐席组' },
  { key: 'load', label: '负载均衡', icon: ThunderboltOutlined, desc: '在候选组内分给在办工单最少的坐席' },
  { key: 'round', label: '轮询分派', icon: TeamOutlined, desc: '候选坐席间依次轮流分派' },
  { key: 'manual', label: '抢单模式', icon: TeamOutlined, desc: '进入工单池，坐席主动抢单' },
];

const rules = ref([
  { id: 1, name: 'VIP 投诉直达二线', cond: "等级=VIP 且 类型=投诉", target: '二线处理组', priority: 1, status: true },
  { id: 2, name: '售后工单分售后组', cond: "应用=售后服务", target: '售后服务组', priority: 2, status: true },
  { id: 3, name: '商机线索分商机组', cond: "类型=商机", target: '商机跟进组', priority: 3, status: true },
  { id: 4, name: '默认一线受理', cond: "其它全部", target: '一线客服组', priority: 99, status: true },
]);
const ruleCols = [
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80 },
  { title: '规则名称', dataIndex: 'name', key: 'name', width: 180 },
  { title: '匹配条件', dataIndex: 'cond', key: 'cond' },
  { title: '分派目标', dataIndex: 'target', key: 'target', width: 150 },
  { title: '启用', dataIndex: 'status', key: 'status', width: 70 },
  { title: '操作', key: 'op', width: 90 },
];
function addRule() { rules.value.push({ id: Date.now(), name: '新规则', cond: '', target: '一线客服组', priority: rules.value.length + 1, status: false }); }
function delRule(id: number) { rules.value = rules.value.filter((r) => r.id !== id); }

const pools = ref([
  { name: '投诉公共池', scope: '投诉工单', claim: '组内可抢', timeout: '5 分钟未抢自动指派', count: 8 },
  { name: '咨询公共池', scope: '咨询工单', claim: '组内可抢', timeout: '3 分钟未抢自动指派', count: 14 },
]);
const fallbackAgent = ref('值班主管(王芳)');
const maxLoad = ref(8);

function save() { message.success('分派配置已保存并生效'); }

// —— 新增工单池（真实写入）——
const poolModalOpen = ref(false);
const pf = reactive({ name: '', scope: '投诉工单', claim: '组内可抢', timeout: '5 分钟未抢自动指派' });
function openAddPool() { Object.assign(pf, { name: '', scope: '投诉工单', claim: '组内可抢', timeout: '5 分钟未抢自动指派' }); poolModalOpen.value = true; }
function savePool() {
  if (!pf.name) { message.error('请填写工单池名称'); return; }
  pools.value.push({ ...pf, count: 0 });
  message.success(`工单池「${pf.name}」已创建`);
  poolModalOpen.value = false;
}
</script>

<template>
  <div class="dispatch-config">
    <AdminPageHeader title="智能分派" subtitle="配置工单到坐席的分派策略、规则链、工单池与兜底坐席" />
    <!-- 分派策略 -->
    <section class="block">
      <div class="b-title">分派策略</div>
      <div class="strat-grid">
        <div v-for="s in STRATEGIES" :key="s.key" class="strat" :class="{ on: strategy === s.key }" @click="strategy = (s.key as any)">
          <div class="s-ic"><component :is="s.icon" /></div>
          <div class="s-name">{{ s.label }}</div>
          <div class="s-desc">{{ s.desc }}</div>
          <div class="s-check" v-if="strategy === s.key">✓</div>
        </div>
      </div>
      <div class="strat-params">
        <a-form layout="inline">
          <a-form-item label="单坐席最大在办">
            <a-input-number v-model:value="maxLoad" :min="1" :max="50" addon-after="单" />
          </a-form-item>
          <a-form-item label="兜底坐席">
            <a-select v-model:value="fallbackAgent" style="width: 200px" :options="['值班主管(王芳)','二线组长(李强)','售后组长(赵敏)'].map((v)=>({value:v,label:v}))" />
          </a-form-item>
        </a-form>
      </div>
    </section>

    <!-- 分派规则链 -->
    <section class="block">
      <div class="b-title">分派规则链 <span class="b-tip">按优先级从上到下匹配，命中即分派</span><a-button type="primary" size="small" @click="addRule"><template #icon><PlusOutlined /></template>新增规则</a-button></div>
      <a-table :columns="ruleCols" :data-source="rules" row-key="id" :pagination="false" size="middle">
        <template #bodyCell="{ column, record }">
          <a-tag v-if="column.key === 'priority'" :color="record.priority === 99 ? 'default' : 'blue'">{{ record.priority === 99 ? '兜底' : 'P' + record.priority }}</a-tag>
          <span v-else-if="column.key === 'cond'" class="cond">{{ record.cond || '—' }}</span>
          <a-tag v-else-if="column.key === 'target'" color="geekblue"><TeamOutlined /> {{ record.target }}</a-tag>
          <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
          <DeleteOutlined v-else-if="column.key === 'op'" class="op-ic danger" @click="delRule(record.id)" />
        </template>
      </a-table>
    </section>

    <!-- 工单池 -->
    <section class="block">
      <div class="b-title">工单池（抢单）<a-button type="primary" size="small" @click="openAddPool"><template #icon><PlusOutlined /></template>新增池</a-button></div>
      <div class="pool-grid">
        <div v-for="p in pools" :key="p.name" class="pool">
          <div class="p-head"><b>{{ p.name }}</b><a-badge :count="p.count" :number-style="{ backgroundColor: '#1a6fff' }" /></div>
          <div class="p-row"><label>适用</label>{{ p.scope }}</div>
          <div class="p-row"><label>抢单</label>{{ p.claim }}</div>
          <div class="p-row"><label>超时</label>{{ p.timeout }}</div>
        </div>
      </div>
    </section>

    <div class="footer"><a-button type="primary" size="large" @click="save">保存并生效</a-button></div>

    <!-- 新增工单池 -->
    <a-modal v-model:open="poolModalOpen" title="新增工单池" :width="480" ok-text="创建" cancel-text="取消" @ok="savePool">
      <a-form layout="vertical">
        <a-form-item label="工单池名称" required><a-input v-model:value="pf.name" placeholder="如：投诉公共池" /></a-form-item>
        <a-form-item label="适用工单"><a-select v-model:value="pf.scope" :options="['投诉工单','咨询工单','建议工单','商机工单','售后工单'].map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="抢单方式"><a-select v-model:value="pf.claim" :options="['组内可抢','全员可抢','指定组可抢'].map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="超时策略"><a-input v-model:value="pf.timeout" placeholder="如：5 分钟未抢自动指派" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.dispatch-config { padding: 16px 24px; max-width: 1100px; }
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
.b-title { font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; }
.b-tip { font-size: 12px; color: #9ca3af; font-weight: 400; flex: 1; }
.strat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.strat { position: relative; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 16px; cursor: pointer; transition: all 0.15s; }
.strat:hover { border-color: #93c5fd; }
.strat.on { border-color: #1a6fff; background: #f0f5ff; }
.s-ic { width: 36px; height: 36px; border-radius: 9px; background: #eff6ff; color: #1a6fff; display: flex; align-items: center; justify-content: center; font-size: 18px; margin-bottom: 10px; }
.strat.on .s-ic { background: #1a6fff; color: #fff; }
.s-name { font-size: 14px; font-weight: 600; color: #111827; }
.s-desc { font-size: 12px; color: #6b7280; margin-top: 4px; line-height: 1.5; }
.s-check { position: absolute; top: 12px; right: 14px; color: #1a6fff; font-weight: 700; }
.strat-params { margin-top: 18px; padding-top: 16px; border-top: 1px dashed #eef0f2; }
.cond { font-size: 13px; color: #374151; background: #f6f8fa; padding: 2px 8px; border-radius: 5px; }
.op-ic { color: #ef4444; cursor: pointer; } .op-ic:hover { opacity: 0.7; }
.pool-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.pool { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
.p-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
.p-row { font-size: 13px; color: #374151; margin-bottom: 6px; display: flex; gap: 10px; }
.p-row label { color: #9ca3af; width: 40px; flex: none; }
.footer { text-align: center; margin-top: 8px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
