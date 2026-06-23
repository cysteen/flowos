<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select as ASelect } from 'ant-design-vue';
import { MessageOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { SMS_TEMPLATES, fillTemplate, type TemplateContext } from '@/mock/notifyTemplates';

const props = defineProps<{
  open: boolean;
  phone: string;
  ctx: TemplateContext;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: { phone: string; templateCode: string; templateName: string; content: string }];
}>();

const templateCode = ref<string>(SMS_TEMPLATES[0].code);
const content = ref('');

const templateOptions = SMS_TEMPLATES.map((t) => ({ value: t.code, label: t.name }));

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
  },
);

// 切换模板 → 重新填充内容（用户后续可自行编辑）
watch(templateCode, (code) => applyTemplate(code));

const charCount = computed(() => content.value.length);
const segments = computed(() => Math.max(1, Math.ceil(charCount.value / 67)));
const canSubmit = computed(() => !!content.value.trim());

function close() {
  emit('update:open', false);
}

function onSubmit() {
  if (!canSubmit.value) return;
  const tpl = SMS_TEMPLATES.find((t) => t.code === templateCode.value);
  emit('submit', {
    phone: props.phone,
    templateCode: templateCode.value,
    templateName: tpl?.name ?? '',
    content: content.value.trim(),
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
          <span>已含签名【讯飞客服】</span>
          <span>{{ charCount }} 字 · 约 {{ segments }} 条</span>
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
</style>
