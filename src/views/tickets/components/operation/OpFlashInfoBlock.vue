<script setup lang="ts">
/**
 * 刷机单侧栏「刷机信息」卡（只读卡，紧跟在客户信息卡之后，PRD §5.3 / 页面规格 P4、P0′-12）。
 * 卡内无输入控件，字段单列纵向排列；标题行右侧：`actions` 插槽（「修改刷机信息」按钮位）＋ 外链「MDM 平台」；
 * 外链「保障中心 · 学校管理」跟在「学校名称」值后。
 */
import { computed } from 'vue';
import { ExportOutlined } from '@ant-design/icons-vue';
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

interface Field { key: string; label: string; value: string; backfilled?: boolean }

const fields = computed<Field[]>(() => {
  const i = props.info;
  const L = FLASH_FIELD_LABELS;
  return [
    { key: 'productName', label: L.productName, value: v(i.productModel) },
    { key: 'sn', label: L.sn, value: v(i.sn) },
    { key: 'studentAccount', label: L.studentAccount, value: v(i.studentAccount) },
    { key: 'studentName', label: L.studentName, value: v(i.studentName) },
    { key: 'schoolName', label: L.schoolName, value: v(i.schoolName) },
    { key: 'reason', label: L.reason, value: v(i.reason) },
    { key: 'romVersion', label: L.romVersion, value: v(i.romVersion), backfilled: i.versionBackfilled && !!i.romVersion },
    { key: 'mdmVersion', label: L.mdmVersion, value: v(i.mdmVersion), backfilled: i.versionBackfilled && !!i.mdmVersion },
  ];
});

/** 设备SN照片缩略图与大图（铭牌图，见 `utils/flashSnPlate.ts`；处理页只做查看） */
const photos = computed(() => props.info.snPhotos.map((name) => ({ name, src: snPlateDataUri(props.info.sn || name) })));
</script>

<template>
  <section class="side-card fi-card">
    <header class="fi-head">
      <span class="card-title">刷机信息</span>
      <div class="fi-head-right">
        <slot name="actions" />
        <a class="fi-link" :href="flashExternalUrl('mdm', info.sn)" target="_blank" rel="noopener noreferrer">
          {{ FLASH_EXTERNAL_LINKS.mdm.label }}<ExportOutlined />
        </a>
      </div>
    </header>

    <dl class="fi-list">
      <div v-for="f in fields" :key="f.key" class="kv">
        <dt class="k">{{ f.label }}</dt>
        <dd class="v">
          <span class="fi-val">{{ f.value }}</span>
          <span v-if="f.backfilled" class="fi-backfill">MDM 回填</span>
          <a
            v-if="f.key === 'schoolName'"
            class="fi-link"
            :href="flashExternalUrl('schoolAdmin')"
            target="_blank"
            rel="noopener noreferrer"
          >{{ FLASH_EXTERNAL_LINKS.schoolAdmin.label }}<ExportOutlined /></a>
        </dd>
      </div>
      <div class="kv">
        <dt class="k">{{ FLASH_FIELD_LABELS.snPhotos }}</dt>
        <dd class="v">
          <span v-if="!photos.length" class="fi-val">—</span>
          <a-image-preview-group v-else>
            <span class="fi-thumbs">
              <a-image
                v-for="p in photos"
                :key="p.name"
                class="fi-thumb"
                :width="56"
                :height="36"
                :src="p.src"
                :alt="p.name"
              />
            </span>
          </a-image-preview-group>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
/* 与侧栏其余卡（工单信息卡 .side-card）同一副骨架 */
.side-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.fi-card { flex: none; }
.card-title { font-size: 14px; font-weight: 700; color: #111827; white-space: nowrap; }
.fi-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; }
.fi-head-right { display: flex; align-items: center; gap: 10px; flex: none; }
.fi-link { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #1a6fff; white-space: nowrap; }
.fi-link:hover { text-decoration: underline; }
.fi-list { display: flex; flex-direction: column; gap: 8px; margin: 0; }
.kv { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 18px; }
.kv .k { flex: none; width: 64px; color: #9ca3af; white-space: nowrap; }
.kv .v {
  flex: 1; min-width: 0; margin: 0;
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px;
}
.fi-val { color: #374151; font-weight: 500; word-break: break-all; }
.fi-backfill { flex: none; font-size: 11px; color: #9ca3af; }
.fi-thumbs { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.fi-thumb { border-radius: 4px; object-fit: cover; cursor: zoom-in; }
.kv :deep(.ant-image) { border-radius: 4px; overflow: hidden; border: 1px solid #e5e7eb; }
</style>
