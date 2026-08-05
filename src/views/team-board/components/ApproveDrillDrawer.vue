<script setup lang="ts">
/**
 * 待审批下钻：行布局与催单/补充/预约事件卡统一
 * ① 工单号 ············· 时间 · 状态
 * ② 标题 ····················· →
 * ③ 类型 + 申请人 / 审批人
 */
import { RightOutlined, CloseOutlined, ArrowRightOutlined } from '@ant-design/icons-vue';
import type { ApprovalDrillRow } from '@/mock/teamBoard';

defineProps<{
  open: boolean;
  rows: ApprovalDrillRow[];
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  'go-center': [];
}>();

function close() {
  emit('update:open', false);
}

function goCenter() {
  emit('go-center');
  close();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ap-fade">
      <div v-if="open" class="ap-mask" @click.self="close">
        <aside class="ap-drawer" role="dialog" aria-label="待审批明细">
          <header class="ap-hd">
            <div class="ap-hd-main">
              <h3 class="ap-title">待审批 · {{ rows.length }} 条</h3>
              <p class="ap-sub">工单号 · 时间 · 状态 · 类型 · 申请人 / 审批人</p>
            </div>
            <button type="button" class="ap-close" aria-label="关闭" @click="close">
              <CloseOutlined />
            </button>
          </header>

          <div class="ap-body">
            <button
              v-for="r in rows"
              :key="r.id"
              type="button"
              class="ev-item"
              @click="goCenter"
            >
              <div class="ev-r1">
                <span class="ev-no" title="工单号">{{ r.ticketNo }}</span>
                <span class="ev-when">{{ r.submit }}</span>
                <span class="ev-status-slot">
                  <span class="ev-unread-tag">{{ r.status }}</span>
                </span>
              </div>
              <div class="ev-r2">
                <span class="ev-title">{{ r.ticketTitle }}</span>
                <RightOutlined class="ev-arrow" />
              </div>
              <div class="ev-r3">
                <span class="ev-cat tone-ap">{{ r.type }}</span>
                <span class="ev-people">
                  申请人 <b>{{ r.applicant }}</b>
                  <span class="ev-sep">·</span>
                  审批人 <b>{{ r.approver }}</b>
                </span>
              </div>
            </button>
          </div>

          <footer class="ap-ft">
            <button type="button" class="ap-ftbtn" @click="goCenter">
              <span>去审批中心处理</span>
              <ArrowRightOutlined class="ap-ft-arrow" />
            </button>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ap-fade-enter-active,
.ap-fade-leave-active { transition: opacity 0.18s ease; }
.ap-fade-enter-from,
.ap-fade-leave-to { opacity: 0; }
.ap-fade-enter-active .ap-drawer,
.ap-fade-leave-active .ap-drawer { transition: transform 0.2s ease; }
.ap-fade-enter-from .ap-drawer,
.ap-fade-leave-to .ap-drawer { transform: translateX(16px); }

.ap-mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(15, 23, 42, 0.28);
  display: flex;
  justify-content: flex-end;
}
.ap-drawer {
  width: min(440px, 100vw);
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.12);
}
.ap-hd {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #e5e7eb;
}
.ap-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.ap-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
.ap-close {
  flex: none;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}
.ap-close:hover { background: #f1f5f9; color: #334155; }
.ap-body {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* —— 与 DrillDrawer 事件卡同构 —— */
.ev-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.ev-item:hover {
  border-color: #bfdbfe;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}
.ev-r1 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ev-no {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: #1a6fff;
  font-variant-numeric: tabular-nums;
}
.ev-when {
  margin-left: auto;
  flex: none;
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}
.ev-status-slot { flex: none; }
.ev-unread-tag {
  font-size: 11px;
  font-weight: 600;
  color: #b45309;
  background: #fff7ed;
  border-radius: 3px;
  padding: 1px 6px;
}
.ev-r2 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ev-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ev-arrow { flex: none; font-size: 10px; color: #cbd5e1; }
.ev-r3 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
  min-width: 0;
}
.ev-cat {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  border-radius: 3px;
  padding: 1px 6px;
}
.ev-cat.tone-ap {
  color: #d97706;
  background: #fffbeb;
}
.ev-people {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}
.ev-people b { font-weight: 600; color: #334155; }
.ev-sep { color: #d1d5db; }

.ap-ft {
  flex: none;
  height: 56px;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
}
.ap-ftbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  font-family: inherit;
}
.ap-ftbtn:hover {
  border-color: #1a6fff;
  color: #1a6fff;
}
.ap-ft-arrow { font-size: 11px; }
</style>
