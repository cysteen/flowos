<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LeftOutlined, DownOutlined } from '@ant-design/icons-vue';
import { adminGroupsFor, ADMIN_OVERVIEW, ADMIN_APPROVAL, PLATFORM_NAV, adminNavActiveKey, adminNavGroupKeyOf, adminSidebarKey } from '@/config/adminNav';
import { APPROVALS } from '@/mock/approvalCenter';
import { useUserStore } from '@/stores/user';

const props = defineProps<{ collapsed?: boolean }>();

const route = useRoute();
const router = useRouter();
const user = useUserStore();
// 平台超管(系统管理员)→「系统管理」精简导航；租户管理员/运营管理员→ 数据总览 + 各自 scope 分组
const isPlatform = computed(() => user.role.adminScope === 'platform');
const groups = computed(() => adminGroupsFor(user.role.adminScope));
const approvalBadge = computed(() => APPROVALS.filter((a) => a.status === '待审批').length);

const activeKey = computed(() => adminNavActiveKey(route.path));
// 侧栏高亮 key：SLA/规则页内 Tab 统一高亮其模块入口（sla-policy / rules-list）
const sidebarKey = computed(() => adminSidebarKey(activeKey.value));

function groupOf(key: string): string | null {
  return adminNavGroupKeyOf(key);
}

const expanded = ref<string | null>(null);
// 进任一页自动展开其所属分组（手风琴）
watchEffect(() => {
  const g = groupOf(activeKey.value);
  if (g) expanded.value = g;
});

function toggle(gk: string) {
  expanded.value = expanded.value === gk ? null : gk;
}
function go(path: string) {
  if (route.path !== path) router.push(path);
}
// 折叠态点击分组图标：直达该组第一个子项
function onGroupHead(g: { key: string; items: { key: string }[] }) {
  if (props.collapsed) go(`/admin/${g.items[0].key}`);
  else toggle(g.key);
}
function backToWorkspace() {
  router.push('/tickets');
}
</script>

<template>
  <div class="admin-sidebar" :class="{ collapsed }">
    <!-- 返回工作区 + 标题 -->
    <a-tooltip :title="collapsed ? '返回工作区' : ''" placement="right">
      <div class="sb-header" @click="backToWorkspace">
        <LeftOutlined :style="{ fontSize: '15px', color: '#6B7280' }" />
        <span v-if="!collapsed" class="sb-title">管理后台</span>
      </div>
    </a-tooltip>

    <!-- 平台超管：租户管理 / 系统参数 -->
    <div v-if="isPlatform" class="menu-list">
      <a-tooltip v-for="it in PLATFORM_NAV.items" :key="it.key" :title="collapsed ? it.label : ''" placement="right">
        <div
          class="nav-item top"
          :class="{ active: activeKey === it.key }"
          @click="go(`/admin/${it.key}`)"
        >
          <component :is="it.icon" class="nav-icon" />
          <span v-if="!collapsed" class="nav-label">{{ it.label }}</span>
        </div>
      </a-tooltip>
    </div>

    <!-- 租户管理员 / 运营管理员：数据总览 + 各自 scope 分组 -->
    <div v-else class="menu-list">
      <!-- 数据总览（一级直达） -->
      <a-tooltip :title="collapsed ? ADMIN_OVERVIEW.label : ''" placement="right">
        <div
          class="nav-item top"
          :class="{ active: activeKey === 'overview' }"
          @click="go('/admin/overview')"
        >
          <component :is="ADMIN_OVERVIEW.icon" class="nav-icon" />
          <span v-if="!collapsed" class="nav-label">{{ ADMIN_OVERVIEW.label }}</span>
        </div>
      </a-tooltip>

      <!-- 审批中心（一级直达，对齐 main-navigation A8#approval） -->
      <a-tooltip :title="collapsed ? ADMIN_APPROVAL.label : ''" placement="right">
        <div
          class="nav-item top"
          :class="{ active: activeKey === 'approval' }"
          @click="go('/admin/approval')"
        >
          <component :is="ADMIN_APPROVAL.icon" class="nav-icon" />
          <span v-if="!collapsed" class="nav-label">{{ ADMIN_APPROVAL.label }}</span>
          <span v-if="approvalBadge > 0 && !collapsed" class="nav-badge">{{ approvalBadge }}</span>
          <span v-if="approvalBadge > 0 && collapsed" class="nav-dot"></span>
        </div>
      </a-tooltip>

      <!-- 分组（按角色 scope） -->
      <div v-for="g in groups" :key="g.key" class="group">
        <!-- 折叠态：hover 弹出飞出子菜单（否则子项无法访问） -->
        <a-popover
          v-if="collapsed"
          placement="rightTop"
          trigger="hover"
          :arrow="false"
          overlay-class-name="admin-flyout-pop"
        >
          <template #content>
            <div class="admin-flyout">
              <div class="flyout-title">{{ g.label }}</div>
              <div
                v-for="it in g.items"
                :key="it.key"
                class="flyout-item"
                :class="{ active: sidebarKey === it.key }"
                @click="go(`/admin/${it.key}`)"
              >
                {{ it.label }}
              </div>
            </div>
          </template>
          <div class="group-head" :class="{ active: groupOf(sidebarKey) === g.key }" @click="onGroupHead(g)">
            <component :is="g.icon" class="nav-icon" />
          </div>
        </a-popover>

        <!-- 展开态：手风琴 -->
        <template v-else>
          <div class="group-head" @click="toggle(g.key)">
            <component :is="g.icon" class="nav-icon" />
            <span class="nav-label">{{ g.label }}</span>
            <DownOutlined class="chev" :class="{ open: expanded === g.key }" />
          </div>
          <div v-show="expanded === g.key" class="group-items">
            <div
              v-for="it in g.items"
              :key="it.key"
              class="nav-item sub"
              :class="{ active: sidebarKey === it.key }"
              @click="go(`/admin/${it.key}`)"
            >
              {{ it.label }}
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-sidebar {
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.sb-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.sb-header:hover .sb-title {
  color: #1a6fff;
}
.sb-title {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
}
.menu-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0 16px;
}
.nav-item,
.group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: #374151;
  border-left: 3px solid transparent;
  border-radius: 0 8px 8px 0;
  margin-right: 8px;
}
.nav-item.top,
.group-head {
  padding: 10px 16px;
}
.nav-item.sub {
  padding: 9px 16px 9px 44px;
  font-size: 14px;
}
.nav-icon {
  font-size: 16px;
  color: #6b7280;
  flex: none;
}
.nav-label {
  font-size: 14px;
  flex: 1;
}
.nav-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}
.chev {
  font-size: 12px;
  color: #9ca3af;
  transition: transform 0.15s;
}
.chev.open {
  transform: rotate(180deg);
}

.nav-item:hover,
.group-head:hover {
  background: #f9fafb;
}

/* 选中：浅蓝底 + 蓝字 + 左 3px 蓝条（与前台一致） */
.nav-item.active {
  background: #eff6ff;
  color: #1a6fff;
  font-weight: 600;
  border-left-color: #1a6fff;
}
.nav-item.active .nav-icon {
  color: #1a6fff;
}

/* —— 折叠态：图标轨 —— */
.admin-sidebar.collapsed .sb-header { justify-content: center; padding: 14px 0 12px; }
.admin-sidebar.collapsed .nav-item.top,
.admin-sidebar.collapsed .group-head {
  justify-content: center;
  padding: 11px 0;
  margin-right: 0;
  border-radius: 0;
  position: relative;
}
.admin-sidebar.collapsed .nav-icon { font-size: 18px; }
/* 折叠态选中：左蓝条 + 浅蓝底，居中图标 */
.admin-sidebar.collapsed .nav-item.active,
.admin-sidebar.collapsed .group-head.active {
  background: #eff6ff;
  border-left-color: #1a6fff;
}
.admin-sidebar.collapsed .group-head.active .nav-icon { color: #1a6fff; }
.nav-dot {
  position: absolute; top: 8px; right: 14px;
  width: 7px; height: 7px; border-radius: 50%; background: #ef4444;
}
</style>

<!-- 折叠态飞出子菜单（popover 内容 teleport 到 body，需非 scoped 样式） -->
<style>
.admin-flyout-pop .ant-popover-inner { padding: 6px; border-radius: 10px; }
.admin-flyout-pop .ant-popover-inner-content { padding: 0; }
.admin-flyout { min-width: 168px; }
.admin-flyout .flyout-title {
  font-size: 12px; font-weight: 600; color: #9ca3af;
  padding: 6px 12px 8px; border-bottom: 1px solid #f0f0f0; margin-bottom: 4px;
}
.admin-flyout .flyout-item {
  padding: 8px 12px; border-radius: 7px; font-size: 13px; color: #374151;
  cursor: pointer; white-space: nowrap;
}
.admin-flyout .flyout-item:hover { background: #f9fafb; color: #1a6fff; }
.admin-flyout .flyout-item.active { background: #eff6ff; color: #1a6fff; font-weight: 600; }
</style>
