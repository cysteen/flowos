<script setup lang="ts">
// 售后工单详情（只读）：从「关联单」Tab 的售后卡片点开，呈现深链跳转后在售后系统看到的内容。
// 客服侧只读——补充与催单在售后系统内完成（D2 改写：客服侧不做写接口）。
import { computed } from 'vue';
import { message } from 'ant-design-vue';
import { FileSearchOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { isAftersaleSettled } from '../../composables/opActions';
import type { LinkedAftersale } from '@/mock/ticketDetail';

const props = defineProps<{
  open: boolean;
  aftersale: LinkedAftersale | null;
  /** 客服原单号，售后侧以此反向关联 */
  ticketNo: string;
  customerName: string;
  customerPhone: string;
  region: string;
  address: string;
  productCategory: string;
  productName: string;
  sn?: string;
  demand: string;
}>();

const emit = defineEmits<{ 'update:open': [v: boolean] }>();

const settled = computed(() => (props.aftersale ? isAftersaleSettled(props.aftersale.status) : false));

const statusColor = computed(() => {
  if (!props.aftersale) return '#6b7280';
  if (settled.value) return '#6b7280';
  return props.aftersale.status === '待接单' ? '#d97706' : '#1a6fff';
});

/** 处理进展：按售后单当前状态推演已走过的节点 */
const progress = computed(() => {
  const as = props.aftersale;
  if (!as) return [];
  const nodes = [
    { node: '工单创建', who: '客服系统', desc: `由客服工单 ${props.ticketNo} 转入，${as.serviceType} · ${as.serviceMethod}` },
    { node: '待接单', who: '售后派单', desc: '已进入待接单队列，等待网点接单' },
    { node: '已接单', who: '售后网点', desc: `网点已接单，按${as.serviceMethod}方式安排处理` },
    { node: '处理中', who: '售后工程师', desc: '正在处理，处理详情以售后系统记录为准' },
    { node: '已完成', who: '售后网点', desc: '处理完成，售后侧执行回访' },
  ];
  const reached = settled.value ? 5 : as.status === '待接单' ? 2 : 4;
  return nodes.slice(0, reached).map((n, i) => ({ ...n, current: i === reached - 1 }));
});

function openInAftersale() {
  if (!props.aftersale) return;
  message.info(`跳转售后系统查看 ${props.aftersale.no}`);
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="售后工单详情"
    :icon="FileSearchOutlined"
    tone="primary"
    :width="620"
    ok-text="在售后系统中打开"
    cancel-text="关闭"
    @update:open="emit('update:open', $event)"
    @ok="openInAftersale"
  >
    <div v-if="aftersale" class="asd">
      <div class="asd-head">
        <div class="asd-no">{{ aftersale.no }}</div>
        <span class="asd-status" :style="{ color: statusColor, borderColor: statusColor + '55', background: statusColor + '14' }">
          {{ aftersale.status }}
        </span>
      </div>

      <div class="asd-section">
        <div class="asd-sec-title">工单信息</div>
        <div class="asd-grid">
          <div class="asd-field"><span class="asd-label">服务类型</span><span class="asd-value">{{ aftersale.serviceType }}</span></div>
          <div class="asd-field"><span class="asd-label">服务方式</span><span class="asd-value">{{ aftersale.serviceMethod }}</span></div>
          <div class="asd-field"><span class="asd-label">创建时间</span><span class="asd-value">{{ aftersale.createdAt }}</span></div>
          <div class="asd-field"><span class="asd-label">关联客服单</span><span class="asd-value">{{ ticketNo }}</span></div>
        </div>
      </div>

      <div class="asd-section">
        <div class="asd-sec-title">客户信息</div>
        <div class="asd-grid">
          <div class="asd-field"><span class="asd-label">客户名称</span><span class="asd-value">{{ customerName }}</span></div>
          <div class="asd-field"><span class="asd-label">联系号码</span><span class="asd-value">{{ customerPhone || '—' }}</span></div>
          <div class="asd-field asd-field-wide"><span class="asd-label">服务地址</span><span class="asd-value">{{ [region, address].filter(Boolean).join(' ') || '—' }}</span></div>
        </div>
      </div>

      <div class="asd-section">
        <div class="asd-sec-title">产品信息</div>
        <div class="asd-grid">
          <div class="asd-field"><span class="asd-label">产品分类</span><span class="asd-value">{{ productCategory }}</span></div>
          <div class="asd-field"><span class="asd-label">产品名称</span><span class="asd-value">{{ productName }}</span></div>
          <div class="asd-field"><span class="asd-label">设备 SN</span><span class="asd-value">{{ sn || '—' }}</span></div>
        </div>
        <div class="asd-field asd-field-stack">
          <span class="asd-label">故障描述</span><span class="asd-value">{{ demand }}</span>
        </div>
      </div>

      <div class="asd-section">
        <div class="asd-sec-title">处理进展</div>
        <div class="asd-timeline">
          <div v-for="p in progress" :key="p.node" class="asd-tl-item" :class="{ current: p.current }">
            <span class="asd-tl-dot" />
            <div class="asd-tl-body">
              <div class="asd-tl-node">{{ p.node }}<span class="asd-tl-who">{{ p.who }}</span></div>
              <div class="asd-tl-desc">{{ p.desc }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="op-tip" :class="settled ? 'op-tip-warn' : 'op-tip-ok'">
        {{ settled
          ? '该售后单已结案，客服侧不再提供在线操作入口，如需继续处理请线下联系售后。'
          : '补充与催单在售后系统内操作，点「在售后系统中打开」跳转。' }}
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.asd { display: flex; flex-direction: column; gap: 12px; }
.asd-head { display: flex; align-items: center; gap: 10px; }
.asd-no { font-size: 15px; font-weight: 700; color: #111827; letter-spacing: .2px; }
.asd-status { font-size: 12px; padding: 1px 8px; border-radius: 10px; border: 1px solid; }
.asd-section { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: #f9fafb; border: 1px solid #eef0f2; border-radius: 8px; }
.asd-sec-title { font-size: 13px; font-weight: 700; color: #1f2937; }
.asd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
.asd-field { display: flex; flex-direction: row; align-items: flex-start; gap: 8px; }
.asd-field-wide { grid-column: 1 / -1; }
.asd-field-stack { align-items: flex-start; }
.asd-label { flex: none; width: 76px; text-align: right; white-space: nowrap; font-size: 12px; color: #6b7280; line-height: 20px; }
.asd-value { flex: 1; min-width: 0; font-size: 13px; color: #1f2937; line-height: 20px; word-break: break-all; }
.asd-timeline { display: flex; flex-direction: column; gap: 10px; }
.asd-tl-item { display: flex; gap: 10px; }
.asd-tl-dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: #d1d5db; }
.asd-tl-item.current .asd-tl-dot { background: #1a6fff; box-shadow: 0 0 0 3px #1a6fff22; }
.asd-tl-body { flex: 1; min-width: 0; }
.asd-tl-node { font-size: 13px; font-weight: 600; color: #1f2937; }
.asd-tl-who { margin-left: 8px; font-size: 12px; font-weight: 400; color: #9ca3af; }
.asd-tl-desc { font-size: 12px; color: #6b7280; line-height: 18px; }
</style>
