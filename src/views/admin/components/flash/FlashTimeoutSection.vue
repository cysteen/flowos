<script setup lang="ts">
/** 刷机配置 · 回传超时时长（PRD §10.5）：小时录入，store 以分钟保存 */
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { useFlashConfigStore } from '@/stores/flashConfig';
import { FLASH_TIMEOUT_MAX_H, FLASH_TIMEOUT_MIN_H } from './flashConfigCatalog';

const config = useFlashConfigStore();

const hours = ref<number | string | undefined>(config.returnTimeoutMin / 60);
const error = ref('');

function save() {
  const raw: unknown = hours.value;
  const n = typeof raw === 'number' ? raw : raw == null || String(raw).trim() === '' ? NaN : Number(raw);
  if (!Number.isInteger(n) || n < FLASH_TIMEOUT_MIN_H || n > FLASH_TIMEOUT_MAX_H) {
    error.value = '请输入 1–48 的整数';
    return;
  }
  error.value = '';
  config.setReturnTimeoutMin(n * 60);
  message.success('已保存');
}
</script>

<template>
  <section class="fc-section">
    <div class="fc-head">
      <span class="fc-title">回传超时时长</span>
    </div>
    <div class="fc-timeout">
      <div class="fc-timeout-row">
        <a-input-number
          v-model:value="hours"
          class="fc-timeout-input"
          :status="error ? 'error' : undefined"
          addon-after="小时"
          @change="error = ''"
          @press-enter="save"
        />
        <a-button type="primary" @click="save">保存</a-button>
      </div>
      <span v-if="error" class="fc-err">{{ error }}</span>
    </div>
  </section>
</template>

<style scoped src="./flashSection.css"></style>
<style scoped>
.fc-timeout { display: flex; flex-direction: column; gap: 6px; }
.fc-timeout-row { display: flex; align-items: center; gap: 10px; }
.fc-timeout-input { width: 160px; }
</style>
