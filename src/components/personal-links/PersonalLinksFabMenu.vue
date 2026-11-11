<script setup lang="ts">
import { ref } from 'vue';
import { BookOutlined, SettingOutlined } from '@ant-design/icons-vue';
import { usePersonalLinksStore } from '@/stores/personalLinks';
import PersonalLinksManageModal from './PersonalLinksManageModal.vue';

/** 浮层宽度（与 bridge 对齐） */
const CARD_W = 200;

const store = usePersonalLinksStore();
const manageOpen = ref(false);
const menuOpen = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function clearHide() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function openMenu() {
  clearHide();
  menuOpen.value = true;
}

function scheduleHide() {
  clearHide();
  hideTimer = setTimeout(() => {
    menuOpen.value = false;
  }, 160);
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openManage(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  clearHide();
  menuOpen.value = false;
  manageOpen.value = true;
}
</script>

<template>
  <div
    class="fab-menu-anchor"
    @mouseenter="openMenu"
    @mouseleave="scheduleHide"
  >
    <div
      v-if="menuOpen"
      class="fab-menu-bridge"
      :style="{ width: `${CARD_W}px` }"
      aria-hidden="true"
    />

    <Transition name="fab-menu">
      <div
        v-if="menuOpen"
        class="fab-menu-card"
        :style="{ width: `${CARD_W}px` }"
        @mouseenter="openMenu"
        @mouseleave="scheduleHide"
      >
        <p class="fab-menu-head">
          <a-tooltip title="常用外链">
            <span class="fab-menu-ico" aria-hidden="true">
              <BookOutlined />
            </span>
          </a-tooltip>
          <span class="fab-menu-title">常用链接</span>
          <button type="button" class="fab-menu-manage" title="维护" @click="openManage">
            <SettingOutlined />
          </button>
        </p>

        <div v-if="!store.links.length" class="fab-menu-empty">
          暂无链接
          <button type="button" class="fab-menu-empty-btn" @click="openManage">去添加</button>
        </div>
        <ul v-else class="fab-menu-list">
          <li v-for="item in store.links" :key="item.id">
            <button type="button" class="fab-bookmark" :title="item.url" @click.stop="openUrl(item.url)">
              <BookOutlined class="fab-bookmark-ico" aria-hidden="true" />
              <span class="fab-bookmark-name">{{ item.title }}</span>
            </button>
          </li>
        </ul>
      </div>
    </Transition>

    <slot />
  </div>

  <PersonalLinksManageModal v-model:open="manageOpen" />
</template>

<style scoped>
.fab-menu-anchor {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: auto;
}

.fab-menu-bridge {
  position: absolute;
  right: 0;
  bottom: 48px;
  height: 16px;
  pointer-events: auto;
}

.fab-menu-card {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  max-width: min(200px, calc(100vw - 40px));
  padding: 0;
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  background: #fff;
  box-shadow:
    0 4px 24px rgba(17, 24, 39, 0.1),
    0 0 0 1px rgba(255, 255, 255, 0.8) inset;
  text-align: left;
  cursor: default;
  z-index: 1;
  overflow: hidden;
}

.fab-menu-card::after {
  content: '';
  position: absolute;
  right: 16px;
  bottom: -5px;
  width: 10px;
  height: 10px;
  background: #fafbfc;
  border-right: 1px solid #e8ecf0;
  border-bottom: 1px solid #e8ecf0;
  transform: rotate(45deg);
}

.fab-menu-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 7px 8px 6px 9px;
  background: linear-gradient(180deg, #fafbfc 0%, #fff 100%);
  border-bottom: 1px solid #f0f2f5;
}

.fab-menu-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #1a6fff;
}

.fab-menu-title {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  letter-spacing: 0.02em;
}

.fab-menu-manage {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  color: #9ca3af;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.fab-menu-manage:hover {
  color: #1a6fff;
  background: #eff6ff;
}

.fab-menu-empty {
  padding: 10px 12px 12px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.5;
  text-align: center;
}

.fab-menu-empty-btn {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 5px 0;
  border: none;
  border-radius: 6px;
  background: #f3f4f6;
  font-size: 11px;
  font-weight: 500;
  color: #1a6fff;
  cursor: pointer;
}
.fab-menu-empty-btn:hover {
  background: #eff6ff;
}

.fab-menu-list {
  list-style: none;
  margin: 0;
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(220px, 40vh);
  overflow-y: auto;
  scrollbar-width: thin;
}

.fab-menu-list > li {
  min-width: 0;
}

/* 与门户 PersonalLinksSection 胶囊书签一致 */
.fab-bookmark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 5px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #f9fafb;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.fab-bookmark:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.fab-bookmark:hover .fab-bookmark-ico,
.fab-bookmark:hover .fab-bookmark-name {
  color: #1a6fff;
}

.fab-bookmark-ico {
  flex: none;
  font-size: 11px;
  color: #6b7280;
  transition: color 0.15s;
}

.fab-bookmark-name {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
  transition: color 0.15s;
}

.fab-menu-list::-webkit-scrollbar {
  width: 3px;
}
.fab-menu-list::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 3px;
}

.fab-menu-enter-active,
.fab-menu-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.fab-menu-enter-from,
.fab-menu-leave-to {
  opacity: 0;
  transform: translateY(5px) scale(0.98);
}
</style>
