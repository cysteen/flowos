<script setup lang="ts">
import { ref, reactive } from 'vue';
import { message } from 'ant-design-vue';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';

// 智能派单（PRD-90）：组内「细选人」引擎。
// 粗路由(派到组/池/人) 归规则中心(A4-02/03)；坐席 技能/容量/状态/画像 归 用户/班组管理，引擎只引用。
// 设计依据见 PRD/智能派单重定位设计(细选人引擎+坐席属性归属).md。

// —— 选人优先级链（命中即止；可开关 + 上下调序）——
const chain = ref([
  { key: 'assign', name: '指定分配', desc: '上游已指定到人则直接生效，跳过后续', enabled: true, locked: true },
  { key: 'repeat', name: '熟客优先', desc: '有效期内优先最近接待过该客户的人（亲和）', enabled: true, locked: false },
  { key: 'skill', name: '技能匹配', desc: '按工单所需技能匹配，技能值高者优先', enabled: true, locked: false },
  { key: 'load', name: '负载均衡', desc: '在办最少 / 剩余容量最大者优先', enabled: true, locked: false },
  { key: 'round', name: '轮询', desc: '最久未被分配者', enabled: true, locked: false },
]);
function moveUp(i: number) { if (i <= 1) return; const a = chain.value; [a[i - 1], a[i]] = [a[i], a[i - 1]]; }
function moveDown(i: number) { const a = chain.value; if (i === 0 || i >= a.length - 1) return; [a[i + 1], a[i]] = [a[i], a[i + 1]]; }

// —— 前置门槛 ——
const gates = reactive({ online: true, capacity: true, schedule: false });
const fallbackAgent = ref('值班主管(王芳)');
const requeueSec = ref(30);

function save() { message.success('派单策略已保存并生效'); }

// —— 运行监控（mock）——
const monitorCols = [
  { title: '处理组', dataIndex: 'group', key: 'group' },
  { title: '在线坐席', dataIndex: 'online', key: 'online', width: 100 },
  { title: '在办工单', dataIndex: 'load', key: 'load', width: 100 },
  { title: '平均等待', dataIndex: 'wait', key: 'wait', width: 110 },
  { title: '分派成功率', dataIndex: 'rate', key: 'rate', width: 120 },
];
const monitorRows = [
  { group: '学习机处理组', online: '8 / 10', load: 42, wait: '3.2 分', rate: '98%' },
  { group: '技术支持组', online: '5 / 6', load: 31, wait: '5.1 分', rate: '95%' },
  { group: '大客户专属组', online: '3 / 3', load: 12, wait: '1.4 分', rate: '100%' },
  { group: '夜班应急组', online: '2 / 4', load: 6, wait: '6.8 分', rate: '92%' },
];

// —— 处理人能力画像（只读，来自 用户/班组管理 + 历史统计）——
const profileCols = [
  { title: '坐席', dataIndex: 'name', key: 'name' },
  { title: '所属组', dataIndex: 'group', key: 'group' },
  { title: '技能值', dataIndex: 'skill', key: 'skill', width: 90 },
  { title: '在办 / 容量', key: 'cap', width: 110 },
  { title: '解决率', dataIndex: 'solve', key: 'solve', width: 90 },
  { title: '擅长类型', dataIndex: 'good', key: 'good' },
];
const profileRows = [
  { name: '张三', group: '学习机处理组', skill: 9, load: 5, cap: 8, solve: '96%', good: '硬件故障 / 退款' },
  { name: '李四', group: '学习机处理组', skill: 7, load: 7, cap: 8, solve: '91%', good: '咨询 / 投诉' },
  { name: '王五', group: '技术支持组', skill: 8, load: 3, cap: 6, solve: '94%', good: '系统问题 / 升级' },
];
</script>

<template>
  <div class="dispatch-config">
    <AdminPageHeader title="智能派单" subtitle="组内「细选人」引擎：粗路由(派到组/池)在「规则中心」配置；坐席 技能/容量/状态/画像 在「用户/班组管理」维护，此处只引用。">
      <template #actions><a-button type="primary" @click="save">保存</a-button></template>
    </AdminPageHeader>

    <!-- 选人优先级链 -->
    <section class="block">
      <div class="b-title">选人优先级链 <span class="b-tip">命中即止；从上到下依次判断，可开关与调序</span></div>
      <div v-for="(s, i) in chain" :key="s.key" class="chain-row" :class="{ off: !s.enabled }">
        <span class="seq">{{ i + 1 }}</span>
        <div class="ci">
          <div class="cn">{{ s.name }}<a-tag v-if="s.locked" color="default" class="lk">锁定</a-tag></div>
          <div class="cd">{{ s.desc }}</div>
        </div>
        <div class="ca">
          <a-button type="text" size="small" :disabled="i <= 1" @click="moveUp(i)"><template #icon><ArrowUpOutlined /></template></a-button>
          <a-button type="text" size="small" :disabled="i === 0 || i === chain.length - 1" @click="moveDown(i)"><template #icon><ArrowDownOutlined /></template></a-button>
          <a-switch v-model:checked="s.enabled" size="small" :disabled="s.locked" />
        </div>
      </div>
    </section>

    <!-- 前置门槛 + 兜底 -->
    <section class="block">
      <div class="b-title">前置门槛与兜底 <span class="b-tip">门槛始终生效；不满足的坐席不进入候选</span></div>
      <div class="gates">
        <div class="gate"><a-switch v-model:checked="gates.online" size="small" /><span>在线状态可接</span></div>
        <div class="gate"><a-switch v-model:checked="gates.capacity" size="small" /><span>容量未满（引用坐席最大在办）</span></div>
        <div class="gate"><a-switch v-model:checked="gates.schedule" size="small" /><span>排班在岗（接入智能排班后生效）</span></div>
      </div>
      <a-form layout="inline" class="mt">
        <a-form-item label="兜底坐席">
          <a-select v-model:value="fallbackAgent" style="width: 200px" :options="['值班主管(王芳)', '二线组长(李强)', '售后组长(赵敏)'].map((v) => ({ value: v, label: v }))" />
        </a-form-item>
        <a-form-item label="超时未接受重派">
          <a-input-number v-model:value="requeueSec" :min="5" :max="600" addon-after="秒" />
        </a-form-item>
      </a-form>
    </section>

    <!-- 运行监控 -->
    <section class="block">
      <div class="b-title">运行监控 <span class="b-tip">各组实时负载与分派成功率</span></div>
      <a-table :columns="monitorCols" :data-source="monitorRows" row-key="group" :pagination="false" size="middle">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'rate'" class="ok">{{ record.rate }}</span>
        </template>
      </a-table>
    </section>

    <!-- 处理人能力画像（只读）-->
    <section class="block">
      <div class="b-title">处理人能力画像 <span class="b-tip">只读 · 来自「用户/班组管理」与历史统计；引擎据此做技能/熟客加权</span></div>
      <a-table :columns="profileCols" :data-source="profileRows" row-key="name" :pagination="false" size="middle">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'cap'">{{ record.load }} / {{ record.cap }}</span>
          <a-tag v-else-if="column.key === 'skill'" color="blue">{{ record.skill }}</a-tag>
        </template>
      </a-table>
    </section>
  </div>
</template>

<style scoped>
.dispatch-config { display: flex; flex-direction: column; gap: 16px; padding: 16px 24px; }
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; }
.b-title { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 14px; padding-left: 10px; border-left: 3px solid #1a6fff; display: flex; align-items: center; gap: 10px; }
.b-tip { font-size: 12px; font-weight: normal; color: #9ca3af; }
.chain-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #eef0f3; border-radius: 8px; margin-bottom: 8px; background: #fcfcfd; }
.chain-row.off { opacity: 0.5; }
.seq { width: 22px; height: 22px; border-radius: 50%; background: #1a6fff; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; flex: none; }
.ci { flex: 1; }
.cn { font-size: 13px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 6px; }
.cn .lk { transform: scale(0.85); }
.cd { font-size: 12px; color: #6b7280; margin-top: 2px; }
.ca { display: flex; align-items: center; gap: 4px; }
.gates { display: flex; flex-wrap: wrap; gap: 24px; }
.gate { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; }
.mt { margin-top: 16px; }
.ok { color: #10b981; font-weight: 600; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
