<script setup lang="ts">
// 已有关联售后单时的悬浮卡片内容：hover 底栏「转售后」/ 顶部「关联售后」时弹出。
// 两个入口此时都已置灰（1:1 关联不再建第二张单），卡片是坐席跳去售后系统的唯一去处。
import { computed } from 'vue';
import { ExportOutlined } from '@ant-design/icons-vue';
import { aftersaleDeepLink } from '../../composables/opActions';

const props = defineProps<{
  no: string;
  status: string;
  serviceType: string;
  /** 已结案：售后侧不再受理补充/催单，只能线下联系 */
  settled: boolean;
}>();

/** 工单号即深链锚点：关联ID 拼进 URL，点单号跳售后系统详情页 */
const url = computed(() => aftersaleDeepLink(props.no));
</script>

<template>
  <div class="as-pop">
    <div class="as-pop-head">
      <span class="as-pop-badge">售后</span>
      <!-- 工单号即深链：点它跳售后系统详情页操作 -->
      <a class="as-pop-no" :href="url" target="_blank" rel="noopener">
        {{ no }} <ExportOutlined />
      </a>
      <span class="as-pop-status" :class="{ settled }">{{ status }}</span>
    </div>
    <div class="as-pop-row">
      <span class="as-pop-label">服务类型</span>
      <span class="as-pop-value">{{ serviceType }}</span>
    </div>
    <div class="as-pop-foot">
      {{ settled
        ? '该售后单已结案，如需继续处理请线下联系售后'
        : '补充与催单请点开工单号，在售后系统中操作' }}
    </div>
  </div>
</template>

<style scoped>
.as-pop { display: flex; flex-direction: column; gap: 6px; max-width: 380px; }
.as-pop-head { display: flex; align-items: center; gap: 8px; }
.as-pop-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; color: #0e7490; background: #cffafe; }
.as-pop-no { font-size: 13px; font-weight: 700; color: #1a6fff; text-decoration: none; }
.as-pop-no:hover { color: #1a6fff; text-decoration: underline; }
.as-pop-no .anticon { margin-left: 2px; font-size: 11px; }
.as-pop-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; color: #1a6fff; background: #1a6fff18; }
.as-pop-status.settled { color: #6b7280; background: #f3f4f6; }
.as-pop-row { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.as-pop-label { flex: none; width: 52px; font-size: 11px; color: #9ca3af; }
.as-pop-value { font-size: 12px; color: #1f2937; }
.as-pop-foot { margin-top: 2px; padding-top: 6px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #6b7280; line-height: 16px; }
</style>
