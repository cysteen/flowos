<script setup lang="ts">
/**
 * 刷机单「工单处理」Tab 第二块：刷机信息（只读区块，PRD §5.3 / 页面规格 P4、P0′-12）。
 * 区块内无输入控件；区块头右侧：`actions` 插槽（「修改刷机信息」按钮位）＋ 外链「MDM 后台」「保障中心 · 学校管理」。
 */
import { computed } from 'vue';
import { ExportOutlined, MobileOutlined } from '@ant-design/icons-vue';
import {
  FLASH_EXTERNAL_LINKS, FLASH_FIELD_LABELS, flashExternalUrl,
  type FlashInfo,
} from '@/views/tickets/types/flash';
import { snPlateDataUri } from '@/views/tickets/utils/flashSnPlate';

const props = defineProps<{
  /** 刷机信息 */
  info: FlashInfo;
}>();

const EMPTY = '—';
const v = (s?: string) => (s && s.trim() ? s : EMPTY);

interface Field { label: string; value: string; backfilled?: boolean }

const fields = computed<Field[]>(() => {
  const i = props.info;
  const L = FLASH_FIELD_LABELS;
  return [
    { label: L.productModel, value: v(i.productModel) },
    { label: L.sn, value: v(i.sn) },
    { label: L.studentAccount, value: v(i.studentAccount) },
    { label: L.studentName, value: v(i.studentName) },
    { label: L.schoolName, value: v(i.schoolName) },
    { label: L.reason, value: v(i.reason) },
    { label: L.romVersion, value: v(i.romVersion), backfilled: i.versionBackfilled && !!i.romVersion },
    { label: L.mdmVersion, value: v(i.mdmVersion), backfilled: i.versionBackfilled && !!i.mdmVersion },
  ];
});

/** 设备SN照片缩略图与大图（铭牌图，见 `utils/flashSnPlate.ts`；处理页只做查看） */
const photos = computed(() => props.info.snPhotos.map((name) => ({ name, src: snPlateDataUri(props.info.sn || name) })));
</script>

<template>
  <section class="fi-block">
    <header class="fi-head">
      <span class="fi-title"><MobileOutlined class="fi-icon" />刷机信息</span>
      <div class="fi-head-right">
        <slot name="actions" />
        <a class="fi-link" :href="flashExternalUrl('mdm', info.sn)" target="_blank" rel="noopener noreferrer">
          {{ FLASH_EXTERNAL_LINKS.mdm.label }}<ExportOutlined />
        </a>
        <a class="fi-link" :href="flashExternalUrl('schoolAdmin')" target="_blank" rel="noopener noreferrer">
          {{ FLASH_EXTERNAL_LINKS.schoolAdmin.label }}<ExportOutlined />
        </a>
      </div>
    </header>

    <div class="fi-body">
      <dl class="fi-grid">
        <div v-for="f in fields" :key="f.label" class="fi-item">
          <dt>{{ f.label }}</dt>
          <dd>
            <span class="fi-val">{{ f.value }}</span>
            <span v-if="f.backfilled" class="fi-backfill">MDM 回填</span>
          </dd>
        </div>
        <div class="fi-item">
          <dt>{{ FLASH_FIELD_LABELS.snPhotos }}</dt>
          <dd>
            <span v-if="!photos.length" class="fi-val">—</span>
            <a-image-preview-group v-else>
              <a-image
                v-for="p in photos"
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
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 12px; min-height: 32px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px 8px 0 0;
}
.fi-title { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #374151; }
.fi-icon { color: #6b7280; font-size: 14px; }
.fi-head-right { display: flex; align-items: center; gap: 12px; flex: none; }
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
.fi-backfill { flex: none; font-size: 11px; color: #9ca3af; }
.fi-thumb { border-radius: 4px; object-fit: cover; cursor: zoom-in; }
.fi-item :deep(.ant-image) { border-radius: 4px; overflow: hidden; border: 1px solid #e5e7eb; }
</style>
