<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select as ASelect } from 'ant-design-vue';
import { MessageOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import {
  SMS_TEMPLATES,
  SMS_TEMPLATE_KIND_LABEL,
  fillTemplate,
  type SmsTemplateKind,
  type TemplateContext,
} from '@/mock/notifyTemplates';

export interface SmsAttachment {
  name: string;
  size: number;
}

const props = defineProps<{
  open: boolean;
  phone: string;
  ctx: TemplateContext;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: {
    phone: string;
    templateCode: string;
    templateName: string;
    templateKind: SmsTemplateKind;
    content: string;
    attachments: SmsAttachment[];
  }];
}>();

const templateCode = ref<string>(SMS_TEMPLATES[0].code);
const content = ref('');
const attachments = ref<SmsAttachment[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);

const templateOptions = SMS_TEMPLATES.map((t) => ({
  value: t.code,
  label: t.kind === 'plain' ? t.name : `${t.name} · ${SMS_TEMPLATE_KIND_LABEL[t.kind]}`,
}));

const currentTemplate = computed(() => SMS_TEMPLATES.find((t) => t.code === templateCode.value));
const templateKind = computed<SmsTemplateKind>(() => currentTemplate.value?.kind ?? 'plain');
/** 附件字段只在「附件下发」出；「附件上传邀请」的链接随正文下发，无需选文件 */
const needAttachment = computed(() => templateKind.value === 'attachSend');

function applyTemplate(code: string) {
  const tpl = SMS_TEMPLATES.find((t) => t.code === code);
  content.value = tpl ? fillTemplate(tpl.content, props.ctx) : '';
}

// 打开时复位为首个模板并按上下文填充
watch(
  () => props.open,
  (v) => {
    if (!v) return;
    templateCode.value = SMS_TEMPLATES[0].code;
    applyTemplate(templateCode.value);
    attachments.value = [];
  },
);

// 切换模板 → 重新填充内容（用户后续可自行编辑）；离开附件下发即清空已选文件
watch(templateCode, (code) => {
  applyTemplate(code);
  if (!needAttachment.value) attachments.value = [];
});

const charCount = computed(() => content.value.length);
const segments = computed(() => Math.max(1, Math.ceil(charCount.value / 67)));
const canSubmit = computed(
  () => !!content.value.trim() && (!needAttachment.value || attachments.value.length > 0),
);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function pickFiles() {
  fileInput.value?.click();
}

function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const picked = Array.from(input.files ?? []).map((f) => ({ name: f.name, size: f.size }));
  const existing = new Set(attachments.value.map((a) => a.name));
  attachments.value.push(...picked.filter((f) => !existing.has(f.name)));
  input.value = '';
}

function removeAttachment(name: string) {
  attachments.value = attachments.value.filter((a) => a.name !== name);
}

function close() {
  emit('update:open', false);
}

function onSubmit() {
  if (!canSubmit.value) return;
  emit('submit', {
    phone: props.phone,
    templateCode: templateCode.value,
    templateName: currentTemplate.value?.name ?? '',
    templateKind: templateKind.value,
    content: content.value.trim(),
    attachments: needAttachment.value ? [...attachments.value] : [],
  });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="发送短信"
    :icon="MessageOutlined"
    tone="primary"
    :width="520"
    ok-text="发送短信"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form">
      <div class="op-field">
        <div class="op-label">接收号码</div>
        <div class="sms-readonly">{{ phone }}</div>
      </div>

      <div class="op-field">
        <div class="op-label req">短信模板</div>
        <ASelect
          v-model:value="templateCode"
          :options="templateOptions"
          style="width:100%"
        />
      </div>

      <div class="op-field">
        <div class="op-label req">短信内容</div>
        <a-textarea
          v-model:value="content"
          :rows="5"
          placeholder="选择模板后自动填充，可在此基础上编辑…"
        />
        <div class="sms-meta">
          <span>已含签名【科大讯飞】</span>
          <span>{{ charCount }} 字 · 约 {{ segments }} 条</span>
        </div>
      </div>

      <div v-if="needAttachment" class="op-field">
        <div class="op-label req">附件</div>
        <div class="sms-attach">
          <button type="button" class="attach-btn" @click="pickFiles">
            <span class="attach-icon" aria-hidden="true">📎</span>
            选择附件
          </button>
          <input
            ref="fileInput"
            type="file"
            class="file-input"
            multiple
            @change="onFilesSelected"
          />
          <ul v-if="attachments.length" class="attach-list">
            <li v-for="a in attachments" :key="a.name" class="attach-item">
              <span class="attach-name">{{ a.name }}</span>
              <span class="attach-size">{{ formatSize(a.size) }}</span>
              <button type="button" class="attach-remove" @click="removeAttachment(a.name)">移除</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.sms-readonly {
  font-size: 13px; color: #374151; font-weight: 500;
  padding: 6px 10px; background: #f9fafb;
  border: 1px solid #e5e7eb; border-radius: 6px;
}
.sms-meta {
  display: flex; justify-content: space-between;
  font-size: 11px; color: #9ca3af;
}

.sms-attach { display: flex; flex-direction: column; gap: 8px; }
.file-input { display: none; }
.attach-btn {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  font-family: inherit; font-size: 13px; font-weight: 600;
  color: #1a6fff; background: #fff;
  border: 1.5px solid #93c5fd; border-radius: 6px; cursor: pointer;
}
.attach-btn:hover { background: #eff6ff; border-color: #1a6fff; }
.attach-icon { font-size: 14px; line-height: 1; }

.attach-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.attach-item {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 10px;
  font-size: 12px; color: #374151;
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;
}
.attach-name { flex: 1; min-width: 0; word-break: break-all; }
.attach-size { flex: none; color: #9ca3af; }
.attach-remove {
  flex: none; margin: 0; padding: 0; border: none; background: none;
  font-family: inherit; font-size: 12px; color: #ef4444; cursor: pointer;
}
.attach-remove:hover { text-decoration: underline; }
</style>
