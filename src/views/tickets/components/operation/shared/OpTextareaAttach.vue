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
  /**
   * 只读：正文不可编辑、附件添加/移除入口不出。
   *
   * ⚠️ 这里用的是**原生 textarea**，`a-config-provider :component-disabled` 管不到它
   * （那个只作用于 antd 组件）。协同信息区此前的只读态因此只收掉了按钮、正文仍可输入，
   * 故必须显式接一个 readonly 下来。
   */
  readonly?: boolean;
  /** 正文长度上限；不传不限 */
  maxlength?: number;
  /** 允许的附件扩展名（小写、不带点）；不传不限 */
  acceptExts?: readonly string[];
  /** 单个附件大小上限（MB）；不传不限 */
  maxFileSizeMb?: number;
  /** 同名文件改为重命名追加（{原名}_{yyyyMMddHHmmss}{.扩展名}）；不传则同名不重复添加 */
  renameDuplicates?: boolean;
}>(), {
  minInputHeight: 52,
  shellBackground: '#fff',
  shellRadius: 6,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:attachments': [files: string[]];
  /** 本次选中的文件（名称 + 字节数），供调用方记录文件大小 */
  filesAdded: [files: { name: string; size: number }[]];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);

function focusInput() {
  textareaEl.value?.focus();
}

defineExpose({ focusInput });

function openFilePicker() {
  if (props.readonly) return;
  fileInput.value?.click();
}

/** 同名时在扩展名前追加添加时刻；同一批次仍重名再追加 _2、_3… */
function renameWithTimestamp(name: string, taken: Set<string>): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = `${stem}_${ts}${ext}`;
  for (let i = 2; taken.has(candidate); i += 1) candidate = `${stem}_${ts}_${i}${ext}`;
  return candidate;
}

function onFilesSelected(e: Event) {
  if (props.readonly) return;
  const input = e.target as HTMLInputElement;
  // 同名文件（与列表内或同一次多选内重名）：renameDuplicates 时重命名追加，否则不再新增标签
  const seen = new Set(props.attachments);
  let rejected = 0;
  const picked: { name: string; size: number }[] = [];
  Array.from(input.files ?? []).forEach((f) => {
    if (seen.has(f.name) && !props.renameDuplicates) return;
    const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : '';
    if ((props.acceptExts && !props.acceptExts.includes(ext))
      || (props.maxFileSizeMb && f.size > props.maxFileSizeMb * 1024 * 1024)) {
      rejected += 1;
      return;
    }
    const name = seen.has(f.name) ? renameWithTimestamp(f.name, seen) : f.name;
    seen.add(name);
    picked.push({ name, size: f.size });
  });
  input.value = '';
  if (rejected) {
    const reason = props.acceptExts ? `格式不支持或超过 ${props.maxFileSizeMb}MB` : `超过 ${props.maxFileSizeMb}MB`;
    message.warning(`${rejected} 个文件${reason}，未添加`);
  }
  if (!picked.length) return;
  const names = picked.map((f) => f.name);
  emit('filesAdded', picked);
  emit('update:attachments', [...props.attachments, ...names]);
  message.success(`已添加 ${names.length} 个附件`);
}

function removeFile(name: string) {
  if (props.readonly) return;
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
        ref="textareaEl"
        class="textarea-input"
        :style="{ minHeight: `${minInputHeight}px` }"
        :value="modelValue"
        :placeholder="placeholder"
        :readonly="readonly"
        :maxlength="maxlength"
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
          <button
            v-if="!readonly"
            type="button"
            class="attach-remove"
            aria-label="移除附件"
            @click="removeFile(f)"
          >
            <CloseOutlined />
          </button>
        </span>
      </div>
      <div v-if="!readonly" class="textarea-foot">
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
          :accept="acceptExts?.map((x) => `.${x}`).join(',')"
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
