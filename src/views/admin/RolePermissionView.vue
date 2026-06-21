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
  message.info('已重置为上次保存状态');
}

// —— 新增 / 编辑角色（真实写入角色树）——
const roleModalOpen = ref(false);
const roleMode = ref<'create' | 'edit'>('create');
const roleName = ref('');
const roleGroup = ref(groups.value[0].name);
function openAddRole() { roleMode.value = 'create'; roleName.value = ''; roleGroup.value = groups.value[0].name; roleModalOpen.value = true; }
function openEditRole() { roleMode.value = 'edit'; roleName.value = selected.value.name; roleModalOpen.value = true; }
function saveRole() {
  if (!roleName.value.trim()) { message.error('请填写角色名称'); return; }
  if (roleMode.value === 'edit') {
    selected.value.name = roleName.value.trim();
    message.success('角色已更新');
  } else {
    const g = groups.value.find((x) => x.name === roleGroup.value) ?? groups.value[0];
    const cloned: RoleDetail = JSON.parse(JSON.stringify(selected.value));
    cloned.name = roleName.value.trim();
    g.roles.push(cloned);
    selected.value = cloned;
    message.success(`角色「${cloned.name}」已新增`);
  }
  roleModalOpen.value = false;
}
</script>

<template>
  <div class="role-perm">
    <!-- 左：角色树 -->
    <div class="role-tree">
      <div class="rt-head">
        <span class="rt-title">角色列表 ({{ roleCount }})</span>
        <button class="rt-add" @click="openAddRole"><PlusOutlined :style="{ fontSize: '11px' }" /> 新增</button>
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
        <button class="btn-sec" @click="openEditRole">编辑角色</button>
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

    <!-- 新增 / 编辑角色 -->
    <a-modal v-model:open="roleModalOpen" :title="roleMode === 'edit' ? '编辑角色' : '新增角色'" :width="440" :ok-text="roleMode === 'edit' ? '保存' : '创建'" cancel-text="取消" @ok="saveRole">
      <a-form layout="vertical">
        <a-form-item label="角色名称" required><a-input v-model:value="roleName" placeholder="如：质检专员" /></a-form-item>
        <a-form-item v-if="roleMode === 'create'" label="所属分组"><a-select v-model:value="roleGroup" :options="groups.map((g) => ({ value: g.name, label: g.name }))" /></a-form-item>
      </a-form>
      <div v-if="roleMode === 'create'" class="role-hint">新角色将复制当前所选角色「{{ selected.name }}」的权限矩阵作为初始模板，可再调整。</div>
    </a-modal>
  </div>
</template>

<style scoped>
.role-perm { display: flex; gap: 16px; padding: 20px 24px; height: 100%; }

/* 角色树 */
.role-tree { width: 280px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; display: flex; flex-direction: column; overflow: hidden; }
.rt-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }
.rt-title { font-size: 13px; font-weight: 600; color: #111827; }
.role-hint { font-size: 12px; color: #9ca3af; margin-top: 8px; line-height: 1.6; }
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
.matrix th { padding: 10px 12px; font-size: 12px; font-weight: 600; color: #6b7280; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; text-align: center; white-space: nowrap; }
.matrix td { padding: 9px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: center; }
.col-module { text-align: left !important; font-weight: 500; color: #374151; min-width: 120px; }
.col-act { width: 64px; }
.col-scope { width: 120px; }
.matrix-foot { display: flex; align-items: center; gap: 6px; padding: 12px 20px; background: #fffbeb; border-top: 1px solid #f0f0f0; font-size: 12px; color: #92400e; }
</style>
