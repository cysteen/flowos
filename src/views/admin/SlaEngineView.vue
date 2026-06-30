<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import AdminSectionTabs from './components/AdminSectionTabs.vue';
import { SLA_NAV_ITEMS, adminNavActiveKey } from '@/config/adminNav';

// SLA 引擎非策略子页（PRD-55/56/57）：双层计时 / 挂起规则 / 预警配置 / 升级链 / 达标统计 / 监控看板 / 工作日历。
const route = useRoute();
const activeKey = computed(() => adminNavActiveKey(route.path));

// —— 双层计时 ——
const timerMode = ref<'whole' | 'node' | 'both'>('both');
const nodeRows = ref([
  { node: '受理节点', resp: '15 分钟', solve: '—', cycle: '—', alert: true },
  { node: '处理节点', resp: '30 分钟', solve: '4 小时', cycle: '1 小时', alert: true },
  { node: '审核节点', resp: '30 分钟', solve: '2 小时', cycle: '—', alert: false },
  { node: '回访节点', resp: '—', solve: '1 工作日', cycle: '—', alert: false },
]);

// —— 挂起规则 ——
const suspendRows = ref([
  { state: '已挂起·待客户', pause: true, note: '等客户回复，停表' },
  { state: '待第三方', pause: true, note: '等外部依赖' },
  { state: '待备件', pause: true, note: '售后等件' },
  { state: '待审核', pause: false, note: '下送审核期，默认计入解决时限' },
  { state: '待回访', pause: true, note: '停整单解决计时，单独起回访时限（已拍板）' },
]);

// —— 预警配置 ——
const alertRows = ref([
  { id: 1, dim: '响应', threshold: '剩余 ≤ 50%', channel: ['站内信'], target: '处理人' },
  { id: 2, dim: '响应', threshold: '剩余 ≤ 25%', channel: ['站内信', '短信'], target: '处理人 + 班组长' },
  { id: 3, dim: '解决', threshold: '已超时', channel: ['短信', '邮件'], target: '班组长' },
]);
const CHANNELS = ['站内信', '短信', '邮件', 'i讯飞'];
const TARGETS = ['处理人', '班组长', '处理人 + 班组长', '指定人'];
function addAlert() { alertRows.value.push({ id: Date.now(), dim: '响应', threshold: '剩余 ≤ 25%', channel: ['站内信'], target: '处理人' }); }
function delAlert(id: number) { alertRows.value = alertRows.value.filter((r) => r.id !== id); }

// —— 升级链 ——
const escChain = ref([
  { level: 'L1', trigger: '响应剩余 ≤ 25%', action: '通知处理人', ref: 'EC01', tone: 'info' },
  { level: 'L2', trigger: '响应已超时', action: '通知班组长 + 打升级标记', ref: 'EC01', tone: 'warn' },
  { level: 'L3', trigger: '解决已超时', action: '自动升级二线组 + 优先级 +1', ref: 'EC02', tone: 'danger' },
  { level: 'L4', trigger: '超时后每 30 分钟', action: '升级客服主管 + 飞书同步', ref: 'EC03', tone: 'danger' },
]);
function goEscRoute() { message.info('前往「规则中心 · 升级路由」（原型占位）'); }

// 监控看板（达标统计）已移出 SLA 配置：完整看板归运营看板/数据总览、班组看板（单一算法源）；
// SLA 策略列表页保留轻量达成概览。

// —— 工作日历 ——
const is724 = ref(false);
const workDays = ref([
  { day: '周一', on: true, time: '09:00 - 18:00' },
  { day: '周二', on: true, time: '09:00 - 18:00' },
  { day: '周三', on: true, time: '09:00 - 18:00' },
  { day: '周四', on: true, time: '09:00 - 18:00' },
  { day: '周五', on: true, time: '09:00 - 18:00' },
  { day: '周六', on: false, time: '—' },
  { day: '周日', on: false, time: '—' },
]);
const holidays = ref(['2026-01-01 元旦', '2026-02-16~22 春节', '2026-04-04~06 清明', '2026-05-01~05 劳动节']);

function save() { message.success('已保存并生效'); }
</script>

<template>
  <div class="sla-engine">
    <AdminSectionTabs :items="SLA_NAV_ITEMS" :active-key="activeKey" />
    <div class="body">
      <!-- ===== 计时口径（双层计时 + 挂起规则 + 工作日历 三合一） ===== -->
      <template v-if="activeKey === 'sla-timing'">
        <div class="card">
          <div class="card-title">双层 SLA 计时模式</div>
          <div class="intro">整单 SLA（创建→解决）与节点 SLA（进入节点→响应/处理）独立计时；工作台「双层倒计时」即源于此。<br>SLA 钟分 <b>响应 / 解决 / 周期更新</b> 三类，一策略内并行计量，<b>仍唯一命中一条策略</b>（非 ITSM 任意多钟）。</div>
          <a-radio-group v-model:value="timerMode" class="mb">
            <a-radio value="whole">仅整单计时</a-radio>
            <a-radio value="node">仅节点级计时</a-radio>
            <a-radio value="both">双层并行（推荐）</a-radio>
          </a-radio-group>
          <table class="grid">
            <thead><tr><th>节点</th><th>响应时限</th><th>解决时限</th><th>周期更新</th><th>节点预警</th></tr></thead>
            <tbody>
              <tr v-for="r in nodeRows" :key="r.node">
                <td class="b">{{ r.node }}</td><td>{{ r.resp }}</td><td>{{ r.solve }}</td><td>{{ r.cycle }}</td>
                <td><a-switch v-model:checked="r.alert" size="small" /></td>
              </tr>
            </tbody>
          </table>
          <a-button type="primary" class="mt" @click="save">保存</a-button>
        </div>
      </template>

      <!-- 挂起规则（计时口径 tab 内） -->
      <template v-if="activeKey === 'sla-timing'">
        <div class="card">
          <div class="card-title">挂起 / 停表规则</div>
          <div class="intro">以下状态停止 SLA 计时，恢复后续算；避免「等客户/等件」期间被判超时。</div>
          <table class="grid">
            <thead><tr><th>状态</th><th>是否停表</th><th>说明</th></tr></thead>
            <tbody>
              <tr v-for="r in suspendRows" :key="r.state">
                <td class="b">{{ r.state }}</td>
                <td><a-switch v-model:checked="r.pause" size="small" /></td>
                <td class="muted">{{ r.note }}</td>
              </tr>
            </tbody>
          </table>
          <a-button type="primary" class="mt" @click="save">保存</a-button>
        </div>
      </template>

      <!-- ===== 预警与升级（预警配置 + 升级链只读引用） ===== -->
      <template v-if="activeKey === 'sla-escalate'">
        <div class="card">
          <div class="card-title">SLA 预警配置</div>
          <div class="intro">计时到阈值时按通知方式提醒对应对象；与工作台 AI 建议条、首页临期/超时联动。</div>
          <div v-for="r in alertRows" :key="r.id" class="alert-row">
            <a-select v-model:value="r.dim" size="small" style="width:88px" :options="[{value:'响应',label:'响应'},{value:'解决',label:'解决'}]" />
            <a-select v-model:value="r.threshold" size="small" style="width:140px" :options="['剩余 ≤ 50%','剩余 ≤ 25%','剩余 ≤ 10%','已超时'].map((o)=>({value:o,label:o}))" />
            <a-select v-model:value="r.channel" mode="multiple" size="small" style="width:200px" :options="CHANNELS.map((o)=>({value:o,label:o}))" placeholder="通知方式" />
            <a-select v-model:value="r.target" size="small" style="flex:1" :options="TARGETS.map((o)=>({value:o,label:o}))" />
            <DeleteOutlined class="del" @click="delAlert(r.id)" />
          </div>
          <a-button type="dashed" block class="mt" @click="addAlert"><template #icon><PlusOutlined /></template>添加预警规则</a-button>
        </div>
      </template>

      <!-- 升级链只读（预警与升级 tab 内） -->
      <template v-if="activeKey === 'sla-escalate'">
        <div class="card">
          <div class="card-title">升级链（只读 · 来自「规则中心 · 升级路由」）<a-button type="link" size="small" style="margin-left:auto" @click="goEscRoute">前往升级路由 ↗</a-button></div>
          <div class="intro">升级规则已统一在「规则中心 · 升级路由」维护，此处只读展示当前生效升级链；SLA 策略通过「触发阈值 + 引用」接入（见 SLA 策略 ⑥ 升级）。</div>
          <div class="chain">
            <div v-for="(e, i) in escChain" :key="e.level" class="chain-node" :class="e.tone">
              <div class="cn-level">{{ e.level }}</div>
              <div class="cn-body">
                <div class="cn-trigger">{{ e.trigger }} <span class="cn-ref">({{ e.ref }})</span></div>
                <div class="cn-action">→ {{ e.action }}</div>
              </div>
              <div v-if="i < escChain.length - 1" class="cn-line" />
            </div>
          </div>
        </div>
      </template>

      <!-- 工作日历（计时口径 tab 内） -->
      <template v-if="activeKey === 'sla-timing'">
        <div class="card">
          <div class="card-title">SLA 工作日历<a-switch v-model:checked="is724" size="small" style="margin-left:12px" /><span class="muted" style="margin-left:6px">7×24 自然时间</span></div>
          <div class="intro">SLA 时限按工作时段推进，非工作时段（夜间/周末/节假日）不计入计时；勾选 7×24 则按自然时间。</div>
          <table class="grid" :class="{ disabled: is724 }">
            <thead><tr><th>星期</th><th>是否工作日</th><th>工作时段</th></tr></thead>
            <tbody>
              <tr v-for="d in workDays" :key="d.day">
                <td class="b">{{ d.day }}</td>
                <td><a-switch v-model:checked="d.on" size="small" :disabled="is724" /></td>
                <td class="muted">{{ d.on ? d.time : '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div class="card-title mt2">节假日（跳过 SLA 计时）</div>
          <div class="holidays">
            <a-tag v-for="h in holidays" :key="h" color="orange">{{ h }}</a-tag>
          </div>
          <a-button type="primary" class="mt" @click="save">保存</a-button>
        </div>
      </template>

      <template v-if="!['sla-timing', 'sla-escalate'].includes(activeKey)">
        <div class="card"><div class="card-title">{{ route.meta.title }}</div><div class="intro">该子页内容待补。</div></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sla-engine { display: flex; flex-direction: column; min-height: 100%; }
.body { padding: 16px 24px; display: flex; flex-direction: column; gap: 16px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; }
.card-title { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 8px; display: flex; align-items: center; }
.card-title.mt2 { margin-top: 20px; }
.intro { font-size: 12px; color: #6b7280; background: #f9fafb; border: 1px solid #f0f0f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; line-height: 1.6; }
.mb { margin-bottom: 14px; } .mt { margin-top: 14px; }
.grid { width: 100%; border-collapse: collapse; }
.grid.disabled { opacity: 0.5; }
.grid th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid #e5e7eb; }
.grid td { padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 13px; }
.grid td.b { font-weight: 600; color: #374151; }
.muted { color: #9ca3af; }
.alert-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.alert-row .del { color: #ef4444; cursor: pointer; flex: none; }
.chain { display: flex; flex-direction: column; gap: 0; padding: 8px 0; }
.chain-node { position: relative; display: flex; align-items: center; gap: 14px; padding: 12px 0 12px 0; }
.cn-level { width: 40px; height: 40px; border-radius: 20px; flex: none; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; z-index: 1; }
.chain-node.info .cn-level { background: #eff6ff; color: #1a6fff; }
.chain-node.warn .cn-level { background: #fffbeb; color: #d97706; }
.chain-node.danger .cn-level { background: #fef2f2; color: #ef4444; }
.cn-body { flex: 1; }
.cn-trigger { font-size: 13px; font-weight: 600; color: #111827; }
.cn-action { font-size: 12px; color: #6b7280; margin-top: 2px; }
.cn-ref { color: #9ca3af; font-weight: normal; font-size: 11px; }
.formula { font-size: 12px; color: #6b7280; background: #f0f6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px; line-height: 1.6; }
.cn-line { position: absolute; left: 20px; top: 44px; width: 2px; height: 28px; background: #e5e7eb; }
.kpi-row { display: flex; gap: 16px; }
.kpi { flex: 1; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 18px; }
.kpi-val { font-size: 26px; font-weight: 700; color: #111827; }
.kpi.ok .kpi-val { color: #10b981; } .kpi.warn .kpi-val { color: #ef4444; }
.kpi-label { font-size: 12px; color: #9ca3af; margin-top: 4px; }
.rate-ok { color: #10b981; font-weight: 600; } .rate-warn { color: #ef4444; font-weight: 600; }
.holidays { display: flex; flex-wrap: wrap; gap: 6px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
