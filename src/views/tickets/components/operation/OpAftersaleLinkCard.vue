<script setup lang="ts">
// 售后 hover 卡片（《【1025】》§5.4）：hover 底栏「转售后」/ 顶部「关联售后」位时弹出，两枚按钮共用这一张。
// 卡片是客服侧跳去售后系统的唯一入口；状态配色按三档（未结案 / 冻结 / 已结案），底部提示由形态判定给。
import { computed } from 'vue';
import { ExportOutlined } from '@ant-design/icons-vue';
import { aftersaleDeepLink } from '../../composables/opActions';
import {
  aftersaleStatusTier, aftersaleTierStyle, type AftersaleSlot,
} from '../../composables/aftersaleButtonForm';

const props = defineProps<{
  no: string;
  status: string;
  serviceType: string;
  /** 底部提示；null ＝ 不出（回传 / 激活形态） */
  foot: string | null;
  /** 本单所占的关联位 */
  heldSlot?: AftersaleSlot;
  /** 同一售后单另一位上的活跃客服单：只显示单号 + 状态 */
  peer?: { no: string; status: string };
}>();

/** 工单号即深链锚点：关联ID 拼进 URL，点单号跳售后系统详情页 */
const url = computed(() => aftersaleDeepLink(props.no));
const statusStyle = computed(() => aftersaleTierStyle(aftersaleStatusTier(props.status)));
</script>

<template>
  <div class="as-pop">
    <div class="as-pop-head">
      <span class="as-pop-badge">售后</span>
      <!-- 工单号即深链：点它跳售后系统详情页操作 -->
      <a class="as-pop-no" :href="url" target="_blank" rel="noopener">
        {{ no }} <ExportOutlined />
      </a>
      <span class="as-pop-status" :style="statusStyle">{{ status }}</span>
    </div>
    <div class="as-pop-row">
      <span class="as-pop-label">服务类型</span>
      <span class="as-pop-value">{{ serviceType }}</span>
    </div>
    <div v-if="peer" class="as-pop-row">
      <span class="as-pop-label">另一张关联工单</span>
      <span class="as-pop-value">{{ peer.no }} · {{ peer.status }}</span>
    </div>
    <div v-if="foot" class="as-pop-foot">{{ foot }}</div>
  </div>
</template>

<style scoped>
.as-pop { display: flex; flex-direction: column; gap: 6px; max-width: 380px; }
.as-pop-head { display: flex; align-items: center; gap: 8px; }
.as-pop-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; color: #0e7490; background: #cffafe; }
.as-pop-no { font-size: 13px; font-weight: 700; color: #1a6fff; text-decoration: none; }
.as-pop-no:hover { color: #1a6fff; text-decoration: underline; }
.as-pop-no .anticon { margin-left: 2px; font-size: 11px; }
.as-pop-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.as-pop-row { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.as-pop-label { flex: none; width: 80px; font-size: 11px; color: #9ca3af; }
.as-pop-value { font-size: 12px; color: #1f2937; }
.as-pop-foot { margin-top: 2px; padding-top: 6px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #6b7280; line-height: 16px; }
</style>
