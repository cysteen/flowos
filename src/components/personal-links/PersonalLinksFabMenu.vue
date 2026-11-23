<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useRoute } from 'vue-router';
import { BookOutlined, SettingOutlined } from '@ant-design/icons-vue';
import { usePersonalLinksStore } from '@/stores/personalLinks';
import PersonalLinksManageModal from './PersonalLinksManageModal.vue';
import PublicLinksSection from '@/components/public-links/PublicLinksSection.vue';

/** 浮层宽度（与 bridge 对齐） */
const CARD_W = 200;
const props = withDefaults(defineProps<{ mode?: 'auto' | 'links' }>(), { mode: 'auto' });
const menuId = `personal-links-${useId()}`;

const store = usePersonalLinksStore();
const route = useRoute();
const anchor = ref<HTMLElement>();
let trigger: HTMLElement | null = null;
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
  if (!store.scopeKey) return;
  // hover 同样记录触发按钮，Esc 才能从列表恢复焦点。
  trigger = anchor.value?.querySelector<HTMLElement>(`[aria-controls="${menuId}"]`)
    ?? Array.from(anchor.value?.querySelectorAll<HTMLElement>('button, [role="button"]') ?? []).find(button => !button.closest('.fab-menu-card'))
    ?? trigger;
  clearHide();
  menuOpen.value = true;
}

function scheduleHide() {
  clearHide();
  hideTimer = setTimeout(() => {
    if (anchor.value?.contains(document.activeElement)) return;
    menuOpen.value = false;
  }, 160);
}

function onTriggerClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('.fab-menu-card')) return;
  // 工单页点击语义仍由 AI 助手提供；共享 AI 面板内入口由主会话接线。
  if (props.mode !== 'links' && /^\/tickets\/[^/]+$/.test(route.path) && route.path !== '/tickets/list') return;
  trigger = (event.target as HTMLElement).closest('button') ?? event.target as HTMLElement;
  clearHide();
  // 真实鼠标先触发 mouseenter，再触发 click；点击保持展开，避免首次点击反而收起。
  openMenu();
}
async function onArrow(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest('.fab-menu-card')) return;
  event.preventDefault(); trigger = event.target as HTMLElement; openMenu();
  await nextTick();
  const panel = anchor.value?.querySelector<HTMLElement>('.fab-menu-card');
  const firstTarget = panel?.querySelector<HTMLElement>('.fab-bookmark')
    ?? panel?.querySelector<HTMLElement>('.fab-menu-empty-btn')
    ?? panel?.querySelector<HTMLElement>('.public-list a')
    ?? panel?.querySelector<HTMLElement>('.fab-menu-manage');
  firstTarget?.focus();
}
function closeMenu() { clearHide(); menuOpen.value = false; trigger?.focus(); }
function outside(event: MouseEvent) { if (!anchor.value?.contains(event.target as Node)) { clearHide(); menuOpen.value = false; } }
function onFocusOut(event: FocusEvent) { if (!anchor.value?.contains(event.relatedTarget as Node)) scheduleHide(); }
document.addEventListener('click', outside);
onBeforeUnmount(() => { clearHide(); document.removeEventListener('click', outside); });
watch(() => store.scopeKey, () => { clearHide(); menuOpen.value = false; manageOpen.value = false; });

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
    ref="anchor"
    class="fab-menu-anchor"
    @click.capture="onTriggerClick"
    @keydown.up="onArrow"
    @keydown.esc.stop.prevent="closeMenu"
    @focusin="clearHide"
    @focusout="onFocusOut"
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
        :id="menuId"
        role="region"
        aria-label="我的网址"
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
          <span class="fab-menu-title">我的网址</span>
          <button type="button" class="fab-menu-manage" title="维护" aria-label="维护个人网址" @click="openManage">
            <SettingOutlined />
          </button>
        </p>

        <div v-if="store.loadError || store.conflict" class="fab-menu-empty">
          {{ store.loadError || '个人网址有更新' }}<button type="button" class="fab-menu-empty-btn" @click="store.reload">重新加载</button>
        </div>
        <div v-if="!store.links.length && !store.loadError" class="fab-menu-empty">
          暂无个人网址
          <button type="button" class="fab-menu-empty-btn" @click="openManage">去添加</button>
        </div>
        <ul v-else-if="store.links.length" class="fab-menu-list">
          <li v-for="item in store.links" :key="item.id">
            <button type="button" class="fab-bookmark" :title="`${item.title}\n${item.url}`" @click.stop="openUrl(item.url)">
              <BookOutlined class="fab-bookmark-ico" aria-hidden="true" />
              <span class="fab-bookmark-name">{{ item.title }}</span>
            </button>
          </li>
        </ul>
        <div class="public-wrap"><PublicLinksSection /></div>
      </div>
    </Transition>

    <slot :open="menuOpen" :controls="menuId" />
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
.public-wrap { padding: 0 8px 8px; }

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
