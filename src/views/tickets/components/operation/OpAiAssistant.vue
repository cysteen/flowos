<script setup lang="ts">
import { computed, ref } from 'vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import type { SimilarTicket } from '@/mock/ticketDetail';
import type { AiTicketInsight } from '@/views/tickets/types/operation';

const props = defineProps<{
  similarTicket: SimilarTicket;
  knowledge: string[];
  aiSummary: string;
  insight?: AiTicketInsight;
}>();

const emit = defineEmits<{ action: [name: string] }>();

const open = ref(false);
const avatarUrl = `${import.meta.env.BASE_URL}images/ai-assistant-avatar.png`;

const summaryText = computed(() => {
  let text = props.aiSummary.trim();
  if (!text.endsWith('。') && !text.endsWith('.')) text += '。';
  const sug = props.insight?.suggestion?.trim();
  if (sug) {
    const s = sug.endsWith('。') ? sug.slice(0, -1) : sug;
    text += `建议${s}。`;
  }
  return text;
});

const similarLine = computed(() => {
  const { no, title, solution } = props.similarTicket;
  const detail = solution.replace(/^方案[：:]\s*/, '');
  return { no, text: `${title}，${detail}` };
});

function collapse() {
  open.value = false;
}
</script>

<template>
  <Teleport to="body">
    <div class="ai-copilot-wrap">
    <button
      v-if="!open"
      type="button"
      class="ai-fab"
      title="打开 AI 助手"
      aria-label="打开 AI 助手"
      @click="open = true"
    >
      <span class="ai-fab-icon" aria-hidden="true">
        <img :src="avatarUrl" alt="" class="ai-fab-img" />
      </span>
    </button>

    <div v-else id="aiPanel" class="ai-panel">
      <div class="ai-panel-head">
        <span class="ai-panel-brand">
          <img :src="avatarUrl" alt="" class="head-avatar" />
          AI 助手
        </span>
        <button type="button" class="head-close" title="收起" aria-label="收起" @click="collapse">
          <CloseOutlined />
        </button>
      </div>

      <div class="ai-panel-body">
        <section class="ai-section">
          <h4 class="ai-section-label">总结</h4>
          <p class="ai-summary">{{ summaryText }}</p>
        </section>

        <section v-if="knowledge.length" class="ai-section">
          <h4 class="ai-section-label">知识推荐</h4>
          <ul class="ai-list">
            <li
              v-for="(k, i) in knowledge"
              :key="i"
              class="ai-list-item"
              @click="emit('action', '采纳知识')"
            >
              {{ k }}
            </li>
          </ul>
        </section>

        <section class="ai-section">
          <h4 class="ai-section-label">相似历史工单</h4>
          <button type="button" class="ai-similar-line" @click="emit('action', '查看方案')">
            <span class="sim-no">{{ similarLine.no }}</span>
            <span class="sim-sep">—</span>
            <span class="sim-text">{{ similarLine.text }}</span>
          </button>
        </section>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ai-copilot-wrap {
  position: fixed;
  right: 24px;
  bottom: 80px;
  z-index: 200;
  width: auto;
  min-height: 0;
  pointer-events: none;
}

.ai-fab {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin-left: 0;
  padding: 0;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #e8f4ff;
  cursor: pointer;
  box-shadow: 0 4px 18px rgba(26, 111, 255, 0.22);
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}
.ai-fab:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 24px rgba(26, 111, 255, 0.32);
}

.ai-fab-icon {
  display: block;
  width: 100%;
  height: 100%;
  line-height: 0;
}

.ai-fab-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 18%;
}

.ai-panel {
  pointer-events: auto;
  position: fixed;
  right: 24px;
  bottom: 80px;
  width: 360px;
  max-width: calc(100vw - 48px);
  height: min(420px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(17, 24, 39, 0.14);
  overflow: hidden;
  animation: panel-in 0.22s ease-out;
}

@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.ai-panel-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(180deg, #fafafa 0%, #fff 100%);
}

.ai-panel-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  letter-spacing: 0.01em;
}

.head-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  object-position: center 18%;
  flex: none;
  border: 1px solid #e5e7eb;
  background: #e8f4ff;
}

.head-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.head-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.ai-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-section-label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  line-height: 1.4;
}

.ai-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #4b5563;
}

.ai-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.ai-list-item {
  font-size: 13px;
  line-height: 1.5;
  color: #1a6fff;
  padding: 7px 0;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  transition: color 0.15s;
}
.ai-list-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.ai-list-item:first-child {
  padding-top: 0;
}
.ai-list-item:hover {
  color: #1558d6;
  text-decoration: underline;
}

.ai-similar-line {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.55;
  color: #4b5563;
  cursor: pointer;
}
.ai-similar-line:hover .sim-no {
  text-decoration: underline;
}

.sim-no {
  color: #1a6fff;
  font-weight: 600;
}

.sim-sep {
  margin: 0 4px;
  color: #9ca3af;
}

.sim-text {
  color: #4b5563;
}
</style>
