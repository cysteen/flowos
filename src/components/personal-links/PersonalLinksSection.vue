<script setup lang="ts">
import { computed, ref } from 'vue';
import { BookOutlined, LinkOutlined, SettingOutlined } from '@ant-design/icons-vue';
import { usePersonalLinksStore } from '@/stores/personalLinks';
import PersonalLinksManageModal from './PersonalLinksManageModal.vue';

const props = withDefaults(
  defineProps<{
    /** compact=AI 面板；inline=门户「快捷入口」卡内子区；card=独立卡片（已废弃，保留兼容） */
    variant?: 'compact' | 'card' | 'inline';
    /** 门户合一卡：分割条已写「我的网址」，仅保留维护按钮 */
    hideHeading?: boolean;
    /** 嵌入门户快捷卡：样式对齐 AI 面板 compact，去掉面板底边 */
    embedded?: boolean;
    /** 门户：维护在左、「我的网址」标题紧挨其右侧（无顶部分割条） */
    hubToolbar?: boolean;
  }>(),
  { variant: 'compact', hideHeading: false, embedded: false, hubToolbar: false },
);

const store = usePersonalLinksStore();
const manageOpen = ref(false);

/** 门户合一卡：固定高度内纵向滚动，默认展示全部（与 FAB 列表区一致） */
const compactScrollable = computed(
  () => props.variant === 'compact' && (props.embedded || props.hubToolbar),
);

function openManage() {
  manageOpen.value = true;
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <section class="pl-section" :class="[variant, { 'pl-section--embedded': embedded }]">
    <div v-if="variant === 'card'" class="pl-card-head">
      <span class="card-title">我的网址</span>
      <button type="button" class="pl-manage" @click="openManage">
        <SettingOutlined />
        维护
      </button>
    </div>
    <div
      v-else-if="variant === 'inline' || variant === 'compact'"
      class="pl-head"
      :class="{
        'pl-head--toolbar': hideHeading && !hubToolbar,
        'pl-head--hub-bar': hubToolbar,
      }"
    >
      <template v-if="hubToolbar">
        <span class="pl-title">
          <LinkOutlined class="pl-ico" />
          我的网址
        </span>
        <button type="button" class="pl-manage" @click="openManage">
          <SettingOutlined />
          维护
        </button>
      </template>
      <template v-else>
        <span v-if="!hideHeading" class="pl-title">
          <LinkOutlined class="pl-ico" />
          我的网址
        </span>
        <button
          type="button"
          class="pl-manage"
          :class="{ 'pl-manage--solo': hideHeading }"
          @click="openManage"
        >
          <SettingOutlined />
          维护
        </button>
      </template>
    </div>

    <div v-if="!store.links.length" class="pl-empty">
      暂无个人网址，点「维护」添加常用链接。
    </div>
    <div
      v-else
      class="pl-list-wrap"
      :class="{
        'pl-list-wrap--compact': variant === 'compact',
        'pl-list-wrap--scroll': compactScrollable,
      }"
    >
    <ul
      class="pl-list"
      :class="{
        'is-card': variant === 'card',
        'is-inline': variant === 'inline',
        'is-compact': variant === 'compact',
      }"
    >
      <li v-for="item in store.links" :key="item.id">
        <button type="button" class="pl-link" :title="item.url" @click="openUrl(item.url)">
          <span class="pl-link-chip">
            <BookOutlined class="pl-bookmark-ico" aria-hidden="true" />
            <span class="pl-name">{{ item.title }}</span>
          </span>
          <span v-if="variant === 'card' || variant === 'inline'" class="pl-url">{{ item.url }}</span>
        </button>
      </li>
    </ul>
    </div>

    <Teleport to="body">
      <PersonalLinksManageModal v-model:open="manageOpen" />
    </Teleport>
  </section>
</template>

<style scoped>
.pl-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pl-section.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pl-section.inline {
  gap: 4px;
}
.pl-section.inline .pl-head {
  margin-bottom: 2px;
}
.pl-head--toolbar {
  justify-content: flex-end;
  margin-bottom: 4px;
}
.pl-head--hub-bar {
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.pl-head--hub-bar .pl-title {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}
.pl-manage--solo {
  margin-left: auto;
}
.pl-section.inline .pl-title {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: none;
}
.pl-section.inline .pl-manage {
  padding: 1px 7px;
  font-size: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
}
.pl-section.inline .pl-empty {
  padding: 2px 0;
  font-size: 10px;
}
.pl-section.compact {
  flex: none;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  padding: 8px 12px 10px;
}
.pl-section.compact.pl-section--embedded {
  border-bottom: none;
}
.pl-section--embedded .pl-head {
  margin-bottom: 6px;
}
.pl-section--embedded .pl-title {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}
.pl-section--embedded .pl-head--toolbar {
  margin-bottom: 6px;
}
.pl-section--embedded .pl-empty {
  font-size: 11px;
}
.pl-section.card .card-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.pl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.pl-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}
.pl-ico {
  color: #1a6fff;
  font-size: 12px;
}
.pl-manage {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  font-size: 11px;
  color: #1a6fff;
  cursor: pointer;
  font-family: inherit;
}
.pl-manage:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.pl-empty {
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.5;
}
.pl-list-wrap--compact.pl-list-wrap--scroll {
  max-height: min(220px, 40vh);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: #d1d5db transparent;
}
.pl-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pl-list.is-compact {
  gap: 6px;
}
.pl-list.is-card {
  flex-direction: column;
  gap: 8px;
}
.pl-list.is-inline {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px;
  max-height: none;
  overflow: visible;
}
.pl-list.is-inline > li {
  flex: 0 0 calc((100% - 8px) / 3);
  max-width: calc((100% - 8px) / 3);
  min-width: 0;
}
.pl-list.is-inline .pl-link {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 4px 6px;
  border-radius: 6px;
  background: #fff;
  border-color: #e5e7eb;
}
.pl-list.is-inline .pl-name {
  width: 100%;
  max-width: 100%;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-list.is-inline .pl-url {
  width: 100%;
  margin-top: 0;
  font-size: 9px;
  font-family: ui-monospace, Consolas, monospace;
}
.pl-link-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
}
.pl-link {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  margin: 0;
  padding: 4px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #f9fafb;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.pl-list.is-card .pl-link {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  border-radius: 8px;
  padding: 8px 12px;
}
.pl-link:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.pl-bookmark-ico {
  flex: none;
  font-size: 11px;
  color: #6b7280;
  transition: color 0.15s;
}
.pl-link:hover .pl-bookmark-ico {
  color: #1a6fff;
}
.pl-name {
  font-size: 11px;
  font-weight: 600;
  color: #1a6fff;
}
.pl-list.is-card .pl-name {
  font-size: 13px;
}
.pl-url {
  margin-top: 2px;
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
