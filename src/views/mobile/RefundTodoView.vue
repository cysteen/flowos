<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RightOutlined } from '@ant-design/icons-vue';
import { useRefundStore } from '@/stores/refund';
import { TICKETS } from '@/mock/tickets';
import { STATUS_DISPLAY_NAME, statusStyle, type Ticket } from '@/views/tickets/types/ticket';
import { isRefundTicket } from '@/views/tickets/types/refund';
import FlashMobileShell from './FlashMobileShell.vue';
import { REFUND_H5_DEFAULT_ACCOUNT, refundH5Account } from './RefundH5Identity';

/**
 * 移动工单 H5 · 待办列表（1120 个册退费 PRD 附录 A.3）：
 * 处理人域账号为本人的「待响应」「处理中」个册退费单；系统退费中不列。
 * 身份＝天鹰 APP 单点登录带入的域账号（路由参数 `account`）。
 */
const route = useRoute();
const router = useRouter();
const store = useRefundStore();

const account = computed(() => refundH5Account(route.query.account) ?? REFUND_H5_DEFAULT_ACCOUNT);

const rows = computed<Ticket[]>(() => {
  // 工单库是普通数组：读 revisions 让个册退费服务每次落库后重算
  void store.revisions;
  return TICKETS
    .filter((t) => isRefundTicket(t) && t.refund?.state.manager?.account === account.value)
    .filter((t) => t.nodeStatus === '待响应' || t.nodeStatus === '处理中')
    .map((t) => store.rowOf(t.no)!)
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
});

/** 卡片时间：最近一条履历的秒级时刻（年-月-日 时:分:秒），无履历回落工单行 */
function lastAt(t: Ticket): string {
  const tl = t.eventTimeline ?? [];
  return tl.length ? tl[tl.length - 1].when : t.updatedAt ?? '';
}

function open(no: string) {
  router.push({ path: '/m/refund/ticket', query: { no, account: account.value } });
}
</script>

<template>
  <FlashMobileShell title="待办工单">
    <section v-for="t in rows" :key="t.no" class="rt-card" @click="open(t.no)">
      <div class="rt-head">
        <span class="rt-no">{{ t.no }}</span>
        <span class="rt-tag" :style="statusStyle(t.nodeStatus)">{{ STATUS_DISPLAY_NAME[t.nodeStatus] }}</span>
      </div>
      <div class="rt-title">{{ t.title }}</div>
      <div class="rt-meta">
        <span>{{ t.refund!.info.schoolName }}</span>
        <span>{{ t.refund!.info.studentName }}</span>
      </div>
      <div class="rt-foot">
        <span>{{ lastAt(t) }}</span>
        <RightOutlined class="rt-arrow" />
      </div>
    </section>
    <div v-if="!rows.length" class="rt-empty">暂无待办工单</div>
  </FlashMobileShell>
</template>

<style scoped>
.rt-card {
  margin-bottom: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
}
.rt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.rt-no {
  color: #1d2129;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px;
}
.rt-tag {
  flex: none;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
}
.rt-title {
  margin-top: 8px;
  color: #1d2129;
  font-size: 15px;
  font-weight: 500;
}
.rt-meta {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  color: #4e5969;
  font-size: 13px;
}
.rt-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  color: #86909c;
  font-size: 12px;
}
.rt-arrow {
  font-size: 12px;
}
.rt-empty {
  padding: 64px 0;
  color: #86909c;
  font-size: 14px;
  text-align: center;
}
</style>
