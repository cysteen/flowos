<script setup lang="ts">
import { ref } from 'vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';

const props = withDefaults(defineProps<{
  modelValue: string;
  attachments: string[];
  placeholder?: string;
  minInputHeight?: number;
  shellBackground?: string;
  shellRadius?: number;
}>(), {
  minInputHeight: 52,
  shellBackground: '#fff',
  shellRadius: 6,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:attachments': [files: string[]];
}>();

const fileInput = ref<HTMLInputElement | null>(null);

function openFilePicker() {
  fileInput.value?.click();
}

function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const names = Array.from(input.files ?? []).map((f) => f.name);
  if (!names.length) return;
  emit('update:attachments', [...props.attachments, ...names]);
  message.success(`已添加 ${names.length} 个附件（演示）`);
  input.value = '';
}

function removeFile(name: string) {
  emit(
    'update:attachments',
    props.attachments.filter((f) => f !== name),
  );
}
</script>

<template>
  <div class="textarea-attach">
    <div
      class="textarea-shell"
      :style="{
        background: shellBackground,
        borderRadius: `${shellRadius}px`,
        minHeight: `${minInputHeight + 36}px`,
      }"
    >
      <textarea
        class="textarea-input"
        :style="{ minHeight: `${minInputHeight}px` }"
        :value="modelValue"
        :placeholder="placeholder"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      />
      <div v-if="attachments.length" class="attach-chips">
        <span v-for="f in attachments" :key="f" class="attach-chip">
          <svg class="clip-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="attach-name">{{ f }}</span>
          <button type="button" class="attach-remove" aria-label="移除附件" @click="removeFile(f)">
            <CloseOutlined />
          </button>
        </span>
      </div>
      <div class="textarea-foot">
        <button type="button" class="attach-trigger" @click="openFilePicker">
          <svg class="clip-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          附件
        </button>
        <input
          ref="fileInput"
          type="file"
          class="file-input"
          multiple
          @change="onFilesSelected"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* haI1v / xIH3T：白底边框框 + 底部 lucide paperclip 附件入口 */
.textarea-attach {
  width: 100%;
}

.textarea-shell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  padding: 8px;
  resize: vertical;
  overflow: auto;
}

.textarea-input {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  border: none;
  outline: none;
  resize: none;
  padding: 0;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  color: #374151;
}
.textarea-input::placeholder {
  color: #6b7280;
}

.attach-chips {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 8px 6px 10px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 12px;
  color: #374151;
}

.attach-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-remove {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 10px;
}
.attach-remove:hover {
  color: #6b7280;
}

.textarea-foot {
  flex: none;
  display: flex;
  align-items: center;
}

.attach-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
  cursor: pointer;
}
.attach-trigger:hover {
  color: #374151;
}

.clip-icon {
  display: block;
  width: 14px;
  height: 14px;
  color: #6b7280;
  flex: none;
}

.file-input {
  display: none;
}
</style>
