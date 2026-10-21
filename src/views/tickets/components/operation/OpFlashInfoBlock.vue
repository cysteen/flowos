<script setup lang="ts">
/**
 * 刷机单「工单处理」Tab 第二块：刷机信息（只读区块，PRD §5.3 / 页面规格 P4、P0′-12）。
 * 区块内无输入控件；区块头：标题右侧紧挨「MDM 平台」「保障中心」外链，行尾为 `actions` 插槽（「修改刷机信息」按钮位）。
 */
import { computed } from 'vue';
import { ExportOutlined, MobileOutlined } from '@ant-design/icons-vue';
import {
  FLASH_EXTERNAL_LINKS, FLASH_FIELD_LABELS, flashExternalUrl,
  type FlashInfo,
} from '@/views/tickets/types/flash';
import { mdmInfoDataUri, snPlateDataUri } from '@/views/tickets/utils/flashSnPlate';

const props = defineProps<{
  /** 刷机信息 */
  info: FlashInfo;
}>();

const EMPTY = '—';
const v = (s?: string) => (s && s.trim() ? s : EMPTY);

interface Field { key: string; label: string; value: string; wide?: boolean }

const fields = computed<Field[]>(() => {
  const i = props.info;
  const L = FLASH_FIELD_LABELS;
  return [
    { key: 'productName', label: L.productName, value: v(i.productModel) },
    { key: 'sn', label: L.sn, value: v(i.sn) },
    { key: 'studentType', label: L.studentType, value: v(i.studentType) },
    { key: 'studentName', label: L.studentName, value: v(i.studentName) },
    { key: 'studentAccount', label: L.studentAccount, value: v(i.studentAccount) },
    { key: 'schoolName', label: L.schoolName, value: v(i.schoolName) },
    { key: 'reason', label: L.reason, value: v(i.reason), wide: true },
  ];
});

/** 设备SN照片 / MDM信息图片缩略图与大图（见 `utils/flashSnPlate.ts`；处理页只做查看） */
const photoGroups = computed(() => {
  const i = props.info;
  return [
    {
      key: 'snPhotos',
      label: FLASH_FIELD_LABELS.snPhotos,
      items: i.snPhotos.map((name) => ({ name, src: snPlateDataUri(i.sn || name) })),
    },
    {
      key: 'mdmPhotos',
      label: FLASH_FIELD_LABELS.mdmPhotos,
      items: (i.mdmPhotos ?? []).map((name) => ({ name, src: mdmInfoDataUri(i.sn || name, i.studentAccount) })),
    },
  ];
});
</script>

<template>
  <section class="fi-block">
    <header class="fi-head">
      <span class="fi-title"><MobileOutlined class="fi-icon" />刷机信息</span>
      <a
        class="fi-link"
        :href="flashExternalUrl('mdm')"
        target="_blank"
        rel="noopener noreferrer"
      >{{ FLASH_EXTERNAL_LINKS.mdm.label }}<ExportOutlined /></a>
      <a
        class="fi-link"
        :href="flashExternalUrl('supportCenter')"
        target="_blank"
        rel="noopener noreferrer"
      >{{ FLASH_EXTERNAL_LINKS.supportCenter.label }}<ExportOutlined /></a>
      <div class="fi-head-right">
        <slot name="actions" />
      </div>
    </header>

    <div class="fi-body">
      <dl class="fi-grid">
        <div v-for="f in fields" :key="f.key" class="fi-item" :class="{ 'is-wide': f.wide }">
          <dt>{{ f.label }}</dt>
          <dd>
            <span class="fi-val" :title="f.wide ? f.value : undefined">{{ f.value }}</span>
          </dd>
        </div>
        <div v-for="g in photoGroups" :key="g.key" class="fi-item">
          <dt>{{ g.label }}</dt>
          <dd>
            <span v-if="!g.items.length" class="fi-val">—</span>
            <a-image-preview-group v-else>
              <a-image
                v-for="p in g.items"
                :key="p.name"
                class="fi-thumb"
                :width="56"
                :height="36"
                :src="p.src"
                :alt="p.name"
              />
            </a-image-preview-group>
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.fi-block { display: flex; flex-direction: column; }
.fi-head {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; min-height: 32px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px 8px 0 0;
}
.fi-title { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #374151; }
.fi-icon { color: #6b7280; font-size: 14px; }
.fi-head-right { display: flex; align-items: center; gap: 12px; flex: none; margin-left: auto; }
.fi-link { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #1a6fff; white-space: nowrap; }
.fi-link:hover { text-decoration: underline; }
.fi-body {
  padding: 8px 12px 10px; background: #f8fafc;
  border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;
}
.fi-grid {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 16px; margin: 0;
}
.fi-item { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; line-height: 20px; }
.fi-item dt { flex: none; width: 72px; color: #6b7280; }
.fi-item dd { flex: 1; min-width: 0; margin: 0; display: flex; align-items: center; gap: 6px; }
.fi-val { color: #111827; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fi-item.is-wide { grid-column: span 2; }
.fi-item.is-wide .fi-val { white-space: normal; overflow-wrap: anywhere; }
.fi-thumb { border-radius: 4px; object-fit: cover; cursor: zoom-in; }
.fi-item :deep(.ant-image) { border-radius: 4px; overflow: hidden; border: 1px solid #e5e7eb; }
</style>
