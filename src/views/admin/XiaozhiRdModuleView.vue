<script setup lang="ts">
/**
 * 产品模块维护（1130 小智工单 一·补 B30，**关闭 W2**）。
 *
 * 三个字段与老系统 IM 后台「系统配置 → 产品模块配置」同形：
 * **产品模块编码 / 产品模块名称 / 接收人（域账号）**。建小智单与处理页「升级 · 产研」时，
 * 坐席选产品模块、接收人由模块带出且只读，推产研那一笔按它找收件人。
 *
 * 🔴 **只维护「模块 → 接收人」，不维护「产品 → 模块」**：模块按业务线而非单一产品分派，
 * 同一产品可以对应多个模块，故建单仍是人工选模块、不做「选了产品自动带出模块」。
 *
 * 🔴 **停用是常规动作，删除要先停用**（1023 拍板）：停用的模块不再出现在建单与升级弹窗的
 * 下拉里、已选过它的历史工单照常显示原值；启用中的那枚「删除」置灰。
 *
 * 字典本体在 `mock/xiaozhi/rdModules.ts`，本页只做增删改查与启停；视觉与交互照
 * `docs/admin-ui-spec.md`（AdminPageHeader + stdPagination + 标准按钮变体）。
 */
import { computed, reactive, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination, toneOf } from '@/config/adminUi';
import {
  XIAOZHI_RD_MODULES, addRdModule, removeRdModule, setRdModuleEnabled, updateRdModule,
  type XiaozhiRdModule,
} from '@/mock/xiaozhi/rdModules';

const keyword = ref('');

const list = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return [...XIAOZHI_RD_MODULES];
  return XIAOZHI_RD_MODULES.filter(
    (m) => `${m.code}${m.name}${m.receiver}`.toLowerCase().includes(kw),
  );
});

const cols = [
  { title: '产品模块编码', dataIndex: 'code', key: 'code', width: 160 },
  { title: '产品模块名称', dataIndex: 'name', key: 'name', width: 200 },
  { title: '接收人（域账号）', dataIndex: 'receiver', key: 'receiver' },
  { title: '状态', key: 'enabled', width: 100 },
  { title: '操作', key: 'op', width: 200 },
];

const editOpen = ref(false);
/** 非空 ＝ 编辑态，存的是打开弹窗那一刻的编码（编码本身可改，故要留原值定位行） */
const editingCode = ref('');
// 启用态不在弹窗里编辑：新建默认启用，改启停走行上的「停用 / 启用」
const form = reactive<XiaozhiRdModule>({ code: '', name: '', receiver: '', enabled: true });

const editTitle = computed(() => (editingCode.value ? '编辑产品模块' : '新增产品模块'));

function openCreate() {
  editingCode.value = '';
  Object.assign(form, { code: '', name: '', receiver: '' });
  editOpen.value = true;
}

function openEdit(row: XiaozhiRdModule) {
  editingCode.value = row.code;
  Object.assign(form, { code: row.code, name: row.name, receiver: row.receiver });
  editOpen.value = true;
}

function save() {
  if (!form.code.trim()) { message.error('请填写产品模块编码'); return; }
  if (!form.name.trim()) { message.error('请填写产品模块名称'); return; }
  const ok = editingCode.value
    ? updateRdModule(editingCode.value, { ...form })
    : addRdModule({ ...form });
  if (!ok) { message.error(`产品模块编码「${form.code.trim()}」已存在`); return; }
  message.success(`产品模块「${form.name.trim()}」已保存`);
  editOpen.value = false;
}

function confirmToggle(row: XiaozhiRdModule) {
  if (row.enabled) {
    Modal.confirm({
      title: '停用产品模块',
      content: `停用后「${row.name}」不再出现在建单与升级产研的产品模块下拉中；已选过它的历史工单照常显示原值。`,
      okText: '停用',
      onOk() {
        setRdModuleEnabled(row.code, false);
        message.success(`已停用产品模块「${row.name}」`);
      },
    });
    return;
  }
  setRdModuleEnabled(row.code, true);
  message.success(`已启用产品模块「${row.name}」`);
}

/** 🔴 删除只对停用的模块开放（1023 拍板）：启用中的那枚按钮置灰，闸门另在字典层兜一道 */
function confirmRemove(row: XiaozhiRdModule) {
  Modal.confirm({
    title: '删除产品模块',
    content: `「${row.name}」删除后不可恢复；已选过它的历史工单照常显示原值。`,
    okText: '删除',
    okType: 'danger',
    onOk() {
      if (!removeRdModule(row.code)) { message.error('启用中的产品模块不可删除，请先停用'); return; }
      message.success(`已删除产品模块「${row.name}」`);
    },
  });
}
</script>

<template>
  <div class="rd-module-page">
    <AdminPageHeader
      title="产品模块维护"
      subtitle="维护产品模块与产研接收人（域账号）的对应关系；建单与升级产研时按所选模块带出接收人"
    >
      <template #actions>
        <a-button type="primary" @click="openCreate">
          <template #icon><PlusOutlined /></template>新增产品模块
        </a-button>
      </template>
    </AdminPageHeader>

    <div class="bar">
      <a-input v-model:value="keyword" class="kw" placeholder="搜索模块编码/名称/接收人" allow-clear>
        <template #prefix><SearchOutlined :style="{ color: '#9ca3af' }" /></template>
      </a-input>
    </div>

    <a-table
      :columns="cols"
      :data-source="list"
      row-key="code"
      :pagination="stdPagination()"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'receiver'">
          <span v-if="(record as XiaozhiRdModule).receiver">{{ (record as XiaozhiRdModule).receiver }}</span>
          <span v-else class="muted">未配置</span>
        </template>
        <template v-else-if="column.key === 'enabled'">
          <a-tag :color="toneOf((record as XiaozhiRdModule).enabled ? '启用' : '停用')">
            {{ (record as XiaozhiRdModule).enabled ? '启用' : '停用' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'op'">
          <a-button type="link" size="small" @click="openEdit(record as XiaozhiRdModule)">编辑</a-button>
          <a-button type="link" size="small" @click="confirmToggle(record as XiaozhiRdModule)">
            {{ (record as XiaozhiRdModule).enabled ? '停用' : '启用' }}
          </a-button>
          <!-- 置灰提示走原生 title（同底栏做法）：ant 的 tooltip 包不住 disabled 按钮的 hover -->
          <span :title="(record as XiaozhiRdModule).enabled ? '启用中的产品模块不可删除，请先停用' : undefined">
            <a-button
              type="link"
              size="small"
              danger
              :disabled="(record as XiaozhiRdModule).enabled"
              @click="confirmRemove(record as XiaozhiRdModule)"
            >删除</a-button>
          </span>
        </template>
      </template>
      <template #emptyText>
        <div class="empty-hint">还没有产品模块配置，点右上角「新增产品模块」建立模块与接收人的对应关系</div>
      </template>
    </a-table>

    <a-modal
      v-model:open="editOpen"
      :title="editTitle"
      :width="480"
      ok-text="保存"
      cancel-text="取消"
      @ok="save"
    >
      <a-form layout="vertical" class="edit-form">
        <a-form-item label="产品模块编码" required>
          <a-input v-model:value="form.code" placeholder="请输入" />
        </a-form-item>
        <a-form-item label="产品模块名称" required>
          <a-input v-model:value="form.name" placeholder="请输入" />
        </a-form-item>
        <a-form-item label="接收人（域账号）">
          <a-input v-model:value="form.receiver" placeholder="请输入" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.rd-module-page { padding: 16px 24px; }
.bar { display: flex; align-items: center; margin-bottom: 16px; }
.kw { width: 280px; }
.muted { color: #9ca3af; }
.empty-hint { padding: 32px 24px; color: #9ca3af; text-align: center; }
.edit-form :deep(.ant-form-item) { margin-bottom: 14px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
