<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { CaretRightOutlined, DownloadOutlined, PauseOutlined } from '@ant-design/icons-vue';

/** 通话录音播放条（沟通记录 / 处理履历共用）：播放暂停 + 进度 + 倍速 + 下载 */
const props = withDefaults(defineProps<{
  /** 进度文案，如「01:20 / 03:05」 */
  progress: string;
  /** 已播放百分比 0–100 */
  percent?: number;
  /** 下载反馈里的录音名称 */
  name?: string;
}>(), { percent: 0, name: '' });

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const playing = ref(false);
const rate = ref<number>(1);

function rateLabel(r: number) {
  return `${r === 1 ? '1.0' : r}x`;
}

function onRateSelect(key: string | number) {
  rate.value = Number(key);
}

function download() {
  message.success(props.name ? `已开始下载录音：${props.name}` : '已开始下载录音');
}
</script>

<template>
  <div class="rec-player">
    <button
      class="rp-play"
      type="button"
      :title="playing ? '暂停' : '播放'"
      @click="playing = !playing"
    >
      <PauseOutlined v-if="playing" />
      <CaretRightOutlined v-else />
    </button>
    <div class="rp-track">
      <div class="rp-fill" :style="{ width: `${percent}%` }" />
    </div>
    <span class="rp-time">{{ progress }}</span>
    <a-dropdown trigger="click" placement="bottomRight">
      <button class="rp-btn rp-rate" type="button" title="倍速播放">{{ rateLabel(rate) }}</button>
      <template #overlay>
        <a-menu :selected-keys="[String(rate)]" @click="onRateSelect($event.key)">
          <a-menu-item v-for="r in PLAYBACK_RATES" :key="String(r)">{{ rateLabel(r) }}</a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
    <button class="rp-btn rp-download" type="button" title="下载录音" @click="download">
      <DownloadOutlined />
    </button>
  </div>
</template>

<style scoped>
.rec-player {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 8px 10px;
}
.rp-play {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  font-size: 12px;
}
.rp-track {
  flex: 1;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
}
.rp-fill { height: 100%; background: #9ca3af; border-radius: 2px; }
.rp-time { font-size: 11px; color: #9ca3af; flex: none; font-variant-numeric: tabular-nums; }
.rp-btn {
  height: 24px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  color: #374151;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  font-size: 11px;
  font-family: inherit;
}
.rp-rate { min-width: 44px; padding: 0 6px; font-weight: 600; font-variant-numeric: tabular-nums; }
.rp-download { width: 24px; padding: 0; font-size: 12px; }
.rp-play:hover,
.rp-btn:hover {
  border-color: #93c5fd;
  color: #1a6fff;
}
</style>
