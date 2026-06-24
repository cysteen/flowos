<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { CloseOutlined, SendOutlined } from '@ant-design/icons-vue';
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
const recoExpanded = ref(true);
const inputText = ref('');
const chatListRef = ref<HTMLElement | null>(null);
const avatarUrl = `${import.meta.env.BASE_URL}images/ai-assistant-avatar.svg`;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const SCENARIOS = [
  { key: 'ticket-analysis', label: '工单分析' },
  { key: 'script', label: '话术推荐' },
  { key: 'knowledge', label: '知识检索' },
  { key: 'upgrade', label: '升级建议' },
  { key: 'empathy', label: '安抚话术' },
] as const;

type ScenarioKey = (typeof SCENARIOS)[number]['key'];

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

const messages = ref<ChatMessage[]>([
  {
    id: 'welcome',
    role: 'assistant',
    text: '你好，我是工单 AI 助手。已根据当前工单生成智能推荐，你也可以点击下方场景或直接提问。',
  },
]);

function collapse() {
  open.value = false;
}

function scrollChatToBottom() {
  nextTick(() => {
    const el = chatListRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function pushUser(text: string) {
  messages.value.push({ id: `u-${Date.now()}`, role: 'user', text });
  scrollChatToBottom();
}

function pushAssistant(text: string) {
  messages.value.push({ id: `a-${Date.now()}`, role: 'assistant', text });
  scrollChatToBottom();
}

function scenarioReply(key: ScenarioKey): string {
  const risk = props.insight?.riskTag ? `（${props.insight.riskTag}）` : '';
  switch (key) {
    case 'ticket-analysis':
      return `【工单分析】\n· 问题：${props.aiSummary}\n· 客户画像：${props.insight?.customerBrief ?? '—'}\n· 工单态势：${props.insight?.ticketBrief ?? '—'}${risk}\n· 建议：${props.insight?.suggestion ?? '按 SLA 优先跟进并回访确认。'}`;
    case 'script':
      return '【话术推荐】\n1. 共情：非常抱歉给您带来不便，跳歌问题我们非常重视，我来帮您尽快排查。\n2. 进展：目前已安排固件升级复测，请您观察 24 小时，如有异常随时联系我们。\n3. 收尾：感谢您的耐心配合，后续我会主动回访确认使用情况。';
    case 'knowledge':
      return `【知识检索】\n${props.knowledge.map((k, i) => `${i + 1}. ${k}`).join('\n') || '暂无匹配知识，可尝试补充问题描述后重新检索。'}`;
    case 'upgrade':
      return '【升级建议】\n当前为 P0 投诉且客户有投诉史，若今日内无法闭环或客户情绪激化，建议升级二线并同步班组长关注，避免外投风险。';
    case 'empathy':
      return '【安抚话术】\n理解您的心情，播放异常确实影响体验。我们已加急处理并安排技术同事跟进，会及时向您反馈进展，请您放心。';
    default:
      return '已收到，正在为您分析…';
  }
}

function runScenario(key: ScenarioKey, label: string) {
  pushUser(label);
  window.setTimeout(() => pushAssistant(scenarioReply(key)), 320);
}

function sendMessage() {
  const text = inputText.value.trim();
  if (!text) return;
  pushUser(text);
  inputText.value = '';
  window.setTimeout(() => {
    pushAssistant('已记录您的问题。结合本单信息，建议先参考上方智能推荐，或点击「工单分析」「话术推荐」获取更具体建议。');
  }, 400);
}

function onRecoKnowledge(k: string) {
  emit('action', '采纳知识');
  pushUser(`查看知识：${k}`);
  window.setTimeout(() => {
    pushAssistant(`已为您打开知识「${k}」。核心步骤：检查固件版本 → 清理歌单缓存 → 复测 30 分钟，仍异常则登记 SN 走售后。`);
  }, 320);
}

function onSimilarClick() {
  emit('action', '查看方案');
  pushUser('查看相似工单方案');
  window.setTimeout(() => {
    pushAssistant(`【相似工单】${similarLine.value.no}\n${similarLine.value.text}\n可参考该方案与客户沟通，必要时申请复用处理流程。`);
  }, 320);
}

watch(open, (v) => {
  if (v) scrollChatToBottom();
});
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
            <span class="online-dot">在线</span>
          </span>
          <button type="button" class="head-close" title="收起" aria-label="收起" @click="collapse">
            <CloseOutlined />
          </button>
        </div>

        <div class="ai-panel-main">
          <!-- 智能推荐（紧凑） -->
          <div class="reco-strip" :class="{ collapsed: !recoExpanded }">
            <button type="button" class="reco-head" @click="recoExpanded = !recoExpanded">
              <span class="reco-title">智能推荐</span>
              <span class="reco-toggle">{{ recoExpanded ? '收起' : '展开' }}</span>
            </button>
            <div v-show="recoExpanded" class="reco-body">
              <p class="reco-summary">{{ summaryText }}</p>
              <div v-if="knowledge.length" class="reco-tags">
                <button
                  v-for="(k, i) in knowledge"
                  :key="i"
                  type="button"
                  class="reco-tag"
                  @click="onRecoKnowledge(k)"
                >
                  {{ k }}
                </button>
              </div>
              <button type="button" class="reco-similar" @click="onSimilarClick">
                <span class="sim-no">{{ similarLine.no }}</span>
                <span class="sim-sep">—</span>
                <span class="sim-text">{{ similarLine.text }}</span>
              </button>
            </div>
          </div>

          <!-- 对话区 -->
          <div ref="chatListRef" class="chat-area">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="chat-row"
              :class="msg.role === 'user' ? 'is-user' : 'is-bot'"
            >
              <img v-if="msg.role === 'assistant'" :src="avatarUrl" alt="" class="chat-avatar" />
              <div class="chat-bubble">{{ msg.text }}</div>
            </div>
          </div>

          <!-- 场景 + 输入 -->
          <div class="chat-foot">
            <div class="scenario-chips">
              <button
                v-for="s in SCENARIOS"
                :key="s.key"
                type="button"
                class="scenario-chip"
                @click="runScenario(s.key, s.label)"
              >
                {{ s.label }}
              </button>
            </div>
            <div class="input-row">
              <input
                v-model="inputText"
                type="text"
                class="chat-input"
                placeholder="输入问题，或选择上方场景…"
                @keydown.enter.prevent="sendMessage"
              />
              <button
                type="button"
                class="send-btn"
                :disabled="!inputText.trim()"
                aria-label="发送"
                @click="sendMessage"
              >
                <SendOutlined />
              </button>
            </div>
          </div>
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
  height: min(520px, calc(100vh - 100px));
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

.online-dot {
  font-size: 10px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  padding: 0 6px;
  line-height: 18px;
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

.ai-panel-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
}

/* —— 智能推荐条 —— */
.reco-strip {
  flex: none;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}
.reco-strip.collapsed .reco-head {
  border-bottom: none;
}

.reco-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}
.reco-title {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}
.reco-toggle {
  font-size: 11px;
  color: #1a6fff;
}

.reco-body {
  padding: 0 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reco-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #4b5563;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.reco-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.reco-tag {
  font-size: 11px;
  color: #1a6fff;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reco-tag:hover {
  background: #dbeafe;
}

.reco-similar {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.5;
  color: #6b7280;
  cursor: pointer;
}
.reco-similar:hover .sim-no {
  text-decoration: underline;
}

.sim-no {
  color: #1a6fff;
  font-weight: 600;
}

.sim-sep {
  margin: 0 3px;
  color: #9ca3af;
}

.sim-text {
  color: #6b7280;
}

/* —— 对话区 —— */
.chat-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 100%;
}
.chat-row.is-user {
  flex-direction: row-reverse;
}
.chat-row.is-user .chat-bubble {
  background: #1a6fff;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.chat-row.is-bot .chat-bubble {
  background: #fff;
  color: #374151;
  border: 1px solid #e5e7eb;
  border-bottom-left-radius: 4px;
}

.chat-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  object-position: center 18%;
  flex: none;
  border: 1px solid #e5e7eb;
  background: #e8f4ff;
}

.chat-bubble {
  max-width: calc(100% - 40px);
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

/* —— 底部场景 + 输入 —— */
.chat-foot {
  flex: none;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scenario-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.scenario-chip {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.scenario-chip:hover {
  color: #1a6fff;
  background: #eff6ff;
  border-color: #bfdbfe;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  color: #111827;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.chat-input:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 2px rgba(26, 111, 255, 0.12);
  background: #fff;
}
.chat-input::placeholder {
  color: #9ca3af;
}

.send-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: #1a6fff;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}
.send-btn:hover:not(:disabled) {
  background: #1558d6;
}
.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
