<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LeftOutlined, DownOutlined } from '@ant-design/icons-vue';
import { ADMIN_GROUPS, ADMIN_OVERVIEW } from '@/config/adminNav';

const route = useRoute();
const router = useRouter();

const activeKey = computed(() => {
  const seg = route.path.split('/admin/')[1];
  return seg ? seg.split('/')[0] : 'overview';
});

function groupOf(key: string): string | null {
  return ADMIN_GROUPS.find((g) => g.items.some((i) => i.key === key))?.key ?? null;
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

    <div class="menu-list">
      <!-- 数据总览（一级直达） -->
      <div
        class="nav-item top"
        :class="{ active: activeKey === 'overview' }"
        @click="go('/admin/overview')"
      >
        <component :is="ADMIN_OVERVIEW.icon" class="nav-icon" />
        <span class="nav-label">{{ ADMIN_OVERVIEW.label }}</span>
      </div>

      <!-- 8 个分组 -->
      <div v-for="g in ADMIN_GROUPS" :key="g.key" class="group">
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
