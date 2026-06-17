<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LeftOutlined, DownOutlined } from '@ant-design/icons-vue';
import { adminGroupsFor, ADMIN_OVERVIEW, ADMIN_APPROVAL, PLATFORM_NAV } from '@/config/adminNav';
import { APPROVALS } from '@/mock/approvalCenter';
import { useUserStore } from '@/stores/user';

const route = useRoute();
const router = useRouter();
const user = useUserStore();
// 平台超管(系统管理员)→「系统管理」精简导航；租户管理员/运营管理员→ 数据总览 + 各自 scope 分组
const isPlatform = computed(() => user.role.adminScope === 'platform');
const groups = computed(() => adminGroupsFor(user.role.adminScope));
const approvalBadge = computed(() => APPROVALS.filter((a) => a.status === '待审批').length);

const activeKey = computed(() => {
  const seg = route.path.split('/admin/')[1];
  return seg ? seg.split('/')[0] : 'overview';
});

function groupOf(key: string): string | null {
  return groups.value.find((g) => g.items.some((i) => i.key === key))?.key ?? null;
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
function backToWorkspace() {
  router.push('/tickets');
}
</script>

<template>
  <div class="admin-sidebar">
    <!-- 返回工作区 + 标题 -->
    <div class="sb-header" @click="backToWorkspace">
      <LeftOutlined :style="{ fontSize: '15px', color: '#6B7280' }" />
      <span class="sb-title">管理后台</span>
    </div>

    <!-- 平台超管：系统管理（租户管理 / 系统参数） -->
    <div v-if="isPlatform" class="menu-list">
      <div class="plat-group-title">{{ PLATFORM_NAV.groupLabel }}</div>
      <div
        v-for="it in PLATFORM_NAV.items"
        :key="it.key"
        class="nav-item top"
        :class="{ active: activeKey === it.key }"
        @click="go(`/admin/${it.key}`)"
      >
        <component :is="it.icon" class="nav-icon" />
        <span class="nav-label">{{ it.label }}</span>
      </div>
    </div>

    <!-- 租户管理员 / 运营管理员：数据总览 + 各自 scope 分组 -->
    <div v-else class="menu-list">
      <!-- 数据总览（一级直达） -->
      <div
        class="nav-item top"
        :class="{ active: activeKey === 'overview' }"
        @click="go('/admin/overview')"
      >
        <component :is="ADMIN_OVERVIEW.icon" class="nav-icon" />
        <span class="nav-label">{{ ADMIN_OVERVIEW.label }}</span>
      </div>

      <!-- 审批中心（一级直达，对齐 main-navigation A8#approval） -->
      <div
        class="nav-item top"
        :class="{ active: activeKey === 'approval' }"
        @click="go('/admin/approval')"
      >
        <component :is="ADMIN_APPROVAL.icon" class="nav-icon" />
        <span class="nav-label">{{ ADMIN_APPROVAL.label }}</span>
        <span v-if="approvalBadge > 0" class="nav-badge">{{ approvalBadge }}</span>
      </div>

      <!-- 分组（按角色 scope） -->
      <div v-for="g in groups" :key="g.key" class="group">
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
            :class="{ active: activeKey === it.key }"
            @click="go(`/admin/${it.key}`)"
          >
            {{ it.label }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-sidebar {
  height: 100%;
  background: #f5f6f7;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.sb-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 10px;
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
.plat-group-title {
  padding: 8px 20px;
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  letter-spacing: 0.05em;
}

.nav-item,
.group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: #374151;
  border-right: 3px solid transparent;
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
  background: #eceef0;
}

/* 选中：白底 + 蓝字 + 右 3px 蓝条 */
.nav-item.active {
  background: #fff;
  color: #1a6fff;
  font-weight: 600;
  border-right-color: #1a6fff;
}
.nav-item.active .nav-icon {
  color: #1a6fff;
}
</style>
