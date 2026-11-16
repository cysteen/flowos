<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select as ASelect } from 'ant-design-vue';
import { SendOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { MAIL_TEMPLATES, fillTemplate, type TemplateContext } from '@/mock/notifyTemplates';

const props = defineProps<{
  open: boolean;
  email: string;
  ctx: TemplateContext;
  /** 无预填邮箱时允许在弹窗填写收件人 */
  editableRecipient?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: { to: string; templateCode: string; subject: string; body: string }];
}>();

const templateCode = ref<string>(MAIL_TEMPLATES[0].code);
const subject = ref('');
const body = ref('');
const toDraft = ref('');

const templateOptions = MAIL_TEMPLATES.map((t) => ({ value: t.code, label: t.name }));

function applyTemplate(code: string) {
  const tpl = MAIL_TEMPLATES.find((t) => t.code === code);
  subject.value = tpl ? fillTemplate(tpl.subject, props.ctx) : '';
  body.value = tpl ? fillTemplate(tpl.body, props.ctx) : '';
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    toDraft.value = props.email.trim();
    templateCode.value = MAIL_TEMPLATES[0].code;
    applyTemplate(templateCode.value);
  },
);

watch(templateCode, (code) => applyTemplate(code));

const recipient = computed(() => (props.editableRecipient ? toDraft.value.trim() : props.email.trim()));
const canSubmit = computed(
  () => !!recipient.value && !!subject.value.trim() && !!body.value.trim(),
);

function close() {
  emit('update:open', false);
}

function onSubmit() {
  if (!canSubmit.value) return;
  emit('submit', {
    to: recipient.value,
    templateCode: templateCode.value,
    subject: subject.value.trim(),
    body: body.value,
  });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="发送邮件"
    :icon="SendOutlined"
    tone="primary"
    :width="560"
    ok-text="发送邮件"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form">
      <div class="op-field">
        <div class="op-label">收件人</div>
        <a-input
          v-if="editableRecipient"
          v-model:value="toDraft"
          placeholder="请输入客户邮箱"
        />
        <div v-else class="mail-readonly">{{ email }}</div>
      </div>

      <div class="op-field">
        <div class="op-label">邮件模板</div>
        <ASelect
          v-model:value="templateCode"
          :options="templateOptions"
          style="width:100%"
        />
      </div>

      <div class="op-field">
        <div class="op-label req">邮件主题</div>
        <a-input v-model:value="subject" placeholder="请输入邮件主题…" />
      </div>

      <div class="op-field">
        <div class="op-label req">邮件正文</div>
        <a-textarea
          v-model:value="body"
          :rows="8"
          placeholder="选择模板后自动填充，可在此基础上编辑…"
        />
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.mail-readonly {
  font-size: 13px; color: #374151; font-weight: 500;
  padding: 6px 10px; background: #f9fafb;
  border: 1px solid #e5e7eb; border-radius: 6px;
}
</style>
