<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { DownOutlined, PlusOutlined, WarningFilled, UserOutlined } from '@ant-design/icons-vue';
import { ROLE_GROUPS, DATA_SCOPE_OPTIONS, type RoleDetail } from '@/mock/rolePermission';

const groups = ref(ROLE_GROUPS.map((g) => ({ ...g, expanded: true })));
const selected = ref<RoleDetail>(ROLE_GROUPS[1].roles[3]); // 默认客服·二线坐席
const roleCount = ROLE_GROUPS.reduce((n, g) => n + g.roles.length, 0);

const ACTION_COLS = [
  { key: 'menu', label: '菜单' },
  { key: 'view', label: '查看' },
  { key: 'create', label: '新建' },
  { key: 'edit', label: '编辑' },
  { key: 'del', label: '删除' },
  { key: 'approve', label: '审批' },
  { key: 'export', label: '导出' },
] as const;

function selectRole(r: RoleDetail) {
  selected.value = r;
}
function save() {
  message.success(`角色「${selected.value.name}」权限已保存`);
}
function reset() {
  message.info('已重置为上次保存状态（占位）');
}
</script>

<template>
  <div class="role-perm">
    <!-- 左：角色树 -->
    <div class="role-tree">
      <div class="rt-head">
        <span class="rt-title">角色列表 ({{ roleCount }})</span>
        <button class="rt-add" @click="message.info('新增角色（占位）')"><PlusOutlined :style="{ fontSize: '11px' }" /> 新增</button>
      </div>
      <div class="rt-body">
        <div v-for="g in groups" :key="g.name" class="rt-group">
          <div class="rt-group-title" @click="g.expanded = !g.expanded">
            <DownOutlined class="chev" :class="{ collapsed: !g.expanded }" :style="{ fontSize: '9px' }" />
            <span>{{ g.name }}</span>
            <span class="rt-group-count">({{ g.roles.length }})</span>
          </div>
          <div v-show="g.expanded">
            <div
              v-for="r in g.roles"
              :key="r.id"
              class="rt-role"
              :class="{ selected: selected.id === r.id }"
              @click="selectRole(r)"
            >
              <span class="rt-dot" :style="{ background: g.color }"></span>
              <span>{{ r.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右：角色详情 -->
    <div class="role-detail">
      <!-- 角色信息 -->
      <div class="card role-info">
        <span class="ri-icon"><UserOutlined :style="{ fontSize: '22px', color: '#1A6FFF' }" /></span>
        <div class="ri-text">
          <div class="ri-name">{{ selected.name }}</div>
          <div class="ri-desc">{{ selected.desc }}</div>
        </div>
        <span class="cat-tag" :class="selected.category === '系统管理' ? 'red' : selected.category === '自定义' ? 'purple' : 'blue'">{{ selected.category }}</span>
        <button class="btn-sec" @click="message.info('编辑角色（占位）')">编辑角色</button>
      </div>

      <!-- 三权分立约束 -->
      <div v-if="selected.separation" class="separation">
        <WarningFilled :style="{ color: '#EF4444' }" />
        <span><b>三权分立约束：</b>{{ selected.separation }}</span>
      </div>

      <!-- 权限配置矩阵 -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">权限配置矩阵</span>
          <div class="card-actions">
            <button class="btn-sec" @click="reset">重置</button>
            <button class="btn-pri" @click="save">保存权限</button>
          </div>
        </div>
        <div class="matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th class="col-module">功能模块</th>
                <th v-for="a in ACTION_COLS" :key="a.key" class="col-act">{{ a.label }}</th>
                <th class="col-scope">数据范围</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in selected.permissions" :key="p.module">
                <td class="col-module">{{ p.module }}</td>
                <td v-for="a in ACTION_COLS" :key="a.key" class="col-act">
                  <a-checkbox v-model:checked="(p as any)[a.key]" />
                </td>
                <td class="col-scope">
                  <a-select v-model:value="p.scope" size="small" style="width: 100%" :options="DATA_SCOPE_OPTIONS" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="matrix-foot">
          <WarningFilled :style="{ color: '#D97706', fontSize: '13px' }" />
          角色权限变更将触发二次确认（密码 + MFA）并记录审计日志，绑定该角色的用户下次登录生效。
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.role-perm { display: flex; gap: 16px; padding: 20px 24px; height: 100%; }

/* 角色树 */
.role-tree { width: 280px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; display: flex; flex-direction: column; overflow: hidden; }
.rt-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }
.rt-title { font-size: 13px; font-weight: 600; color: #111827; }
.rt-add { font-size: 12px; color: #fff; background: #1a6fff; border: none; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
.rt-body { padding: 8px; overflow-y: auto; }
.rt-group-title { display: flex; align-items: center; gap: 6px; padding: 6px 10px; font-size: 11px; font-weight: 600; color: #9ca3af; cursor: pointer; letter-spacing: 0.5px; }
.chev { transition: transform 0.15s; }
.chev.collapsed { transform: rotate(-90deg); }
.rt-group-count { color: #d1d5db; }
.rt-role { display: flex; align-items: center; gap: 8px; padding: 7px 10px 7px 28px; font-size: 13px; color: #374151; border-radius: 6px; cursor: pointer; }
.rt-role:hover { background: #f5f5f5; }
.rt-role.selected { background: #eff6ff; color: #1a6fff; font-weight: 600; }
.rt-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }

/* 详情 */
.role-detail { flex: 1; min-width: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.role-info { display: flex; align-items: center; gap: 16px; padding: 16px 20px; }
.ri-icon { width: 48px; height: 48px; border-radius: 12px; background: #eff6ff; display: flex; align-items: center; justify-content: center; flex: none; }
.ri-text { flex: 1; min-width: 0; }
.ri-name { font-size: 18px; font-weight: 700; color: #111827; }
.ri-desc { font-size: 12px; color: #6b7280; margin-top: 2px; }
.cat-tag { font-size: 12px; padding: 2px 10px; border-radius: 20px; font-weight: 500; }
.cat-tag.red { background: #fee2e2; color: #dc2626; }
.cat-tag.blue { background: #dbeafe; color: #1d4ed8; }
.cat-tag.purple { background: #ede9fe; color: #6d28d9; }
.btn-sec { font-size: 12px; color: #374151; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.btn-pri { font-size: 12px; color: #fff; background: #1a6fff; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; }

.separation { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; font-size: 12px; color: #991b1b; }

.card-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #f0f0f0; }
.card-title { font-size: 15px; font-weight: 600; color: #111827; }
.card-actions { display: flex; gap: 8px; }
.matrix-wrap { overflow-x: auto; }
.matrix { width: 100%; border-collapse: collapse; }
.matrix th { padding: 10px 12px; font-size: 12px; font-weight: 600; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #e5e7eb; text-align: center; white-space: nowrap; }
.matrix td { padding: 9px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: center; }
.col-module { text-align: left !important; font-weight: 500; color: #374151; min-width: 120px; }
.col-act { width: 64px; }
.col-scope { width: 120px; }
.matrix-foot { display: flex; align-items: center; gap: 6px; padding: 12px 20px; background: #fffbeb; border-top: 1px solid #f0f0f0; font-size: 12px; color: #92400e; }
</style>
