<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import { OrderedListOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { delegateTargetLabel, type DelegateTask } from '@/stores/delegateTasks';
import { DELEGATE_TASK_TEXT_MAX } from '../../composables/opActions';

/**
 * 委派任务面板，落在速览带与 Tab 之间。两种视角：
 * - 主责：「委派任务」，当前一批的拆分情况与处理进度；
 * - 协办人：「委派给我的任务」，逐条委派人、任务说明，待处理可处理、已完成可查看结果。
 */
const props = defineProps<{
  /** 本单全部子任务（任务列表弹窗用） */
  tasks: DelegateTask[];
  /** 当前一批（主责视角的文案与进度取它） */
  currentBatch: DelegateTask[];
  /** 委派给当前登录人的子任务；有值即协办人视角 */
  myTasks: DelegateTask[];
}>();

const emit = defineEmits<{ handle: [taskId: string, result: string] }>();

const isDelegatee = computed(() => props.myTasks.length > 0);

const introText = computed(() => {
  const list = props.currentBatch;
  const noun = list[0]?.mode === 'group' ? '协办组' : '协办人';
  const names = list.map(delegateTargetLabel).join('、');
  return `本工单已拆分为 ${list.length} 条子任务，分别委派给${noun}【${names}】，各任务处理完成后将汇总回到您处，您也可强制撤销`;
});
const progressText = computed(() => {
  const list = props.currentBatch;
  const done = list.filter((t) => t.status === '已完成').length;
  const pending = list.filter((t) => t.status === '待处理').map(delegateTargetLabel);
  return `已完成 ${done}/${list.length}${pending.length ? ` · ${pending.join('、')} 待处理` : ''}`;
});

/* ---- 任务列表弹窗 ---- */
const listOpen = ref(false);
const batches = computed(() => {
  const map = new Map<string, DelegateTask[]>();
  props.tasks.forEach((t) => { map.set(t.batchId, [...(map.get(t.batchId) ?? []), t]); });
  return [...map.values()].reverse();
});
function statusClass(status: DelegateTask['status']) {
  if (status === '已完成') return 'is-done';
  return status === '待处理' ? 'is-pending' : 'is-void';
}

/* ---- 处理任务 ---- */
const handleOpen = ref(false);
const handleTask = ref<DelegateTask | null>(null);
const handleResult = ref('');
function openHandle(t: DelegateTask) {
  handleTask.value = t;
  handleResult.value = '';
  handleOpen.value = true;
}
function submitHandle() {
  const text = handleResult.value.trim();
  if (!text) {
    message.warning('请填写委派处理结果');
    return;
  }
  if (handleTask.value) emit('handle', handleTask.value.id, text);
  handleOpen.value = false;
}

/* ---- 委派处理结果 ---- */
const resultOpen = ref(false);
const resultTask = ref<DelegateTask | null>(null);
function openResult(t: DelegateTask) {
  resultTask.value = t;
  resultOpen.value = true;
}
</script>

<template>
  <a-config-provider :auto-insert-space-in-button="false">
  <div class="dt-panel">
    <div class="dt-head">
      <span class="dt-title"><i class="dt-bar" />{{ isDelegatee ? '委派给我的任务' : '委派任务' }}</span>
      <button type="button" class="dt-link" @click="listOpen = true">
        <OrderedListOutlined />{{ isDelegatee ? '任务列表' : '委派任务列表' }}
      </button>
    </div>

    <template v-if="isDelegatee">
      <div v-for="t in myTasks" :key="t.id" class="dt-mine">
        <span class="dt-mine-text">委派人：{{ t.operator }}　任务说明：{{ t.task }}</span>
        <button v-if="t.status === '待处理'" type="button" class="dt-btn" @click="openHandle(t)">处理任务</button>
        <button v-else type="button" class="dt-btn" @click="openResult(t)">查看结果</button>
      </div>
    </template>
    <template v-else>
      <div class="dt-body">{{ introText }}</div>
      <div class="dt-body"><span class="dt-prog">处理进度：</span>{{ progressText }}</div>
    </template>

    <OpActionModal
      v-model:open="listOpen"
      title="委派任务列表"
      :width="720"
      no-footer
      modal-class="op-delegate-modal"
    >
      <a-config-provider :component-disabled="false">
        <div class="batch-list">
          <div v-for="group in batches" :key="group[0].batchId" class="batch-group">
            <div class="batch-head">
              <i class="batch-dot" />
              <span class="batch-time">{{ group[0].batchAt }}</span>
              <span class="batch-operator">
                <span class="batch-operator-label">委派人</span>
                <span class="batch-operator-name">{{ group[0].operator }}</span>
              </span>
              <span class="batch-count">{{ group.length }} 条任务</span>
            </div>
            <div class="batch-items">
              <div v-for="t in group" :key="t.id" class="batch-item">
                <span class="rail"><i class="rail-node" /></span>
                <span class="col-assignee">{{ delegateTargetLabel(t) }}</span>
                <span class="col-task" :title="t.task">{{ t.task }}</span>
                <span class="col-status"><span class="dt-tag" :class="statusClass(t.status)">{{ t.status }}</span></span>
              </div>
            </div>
          </div>
        </div>
      </a-config-provider>
    </OpActionModal>

    <OpActionModal
      v-model:open="handleOpen"
      title="处理任务"
      :width="600"
      ok-text="确认"
      modal-class="op-delegate-modal"
      @ok="submitHandle"
    >
      <a-config-provider :component-disabled="false">
        <div class="op-form">
          <div class="op-field">
            <div class="op-label">任务说明</div>
            <div class="op-confirm">{{ handleTask?.task }}</div>
          </div>
          <div class="op-field">
            <div class="op-label req">委派处理结果</div>
            <a-textarea
              v-model:value="handleResult"
              :rows="3"
              :maxlength="DELEGATE_TASK_TEXT_MAX"
              show-count
              placeholder="请填写委派处理结果"
            />
          </div>
        </div>
      </a-config-provider>
    </OpActionModal>

    <OpActionModal
      v-model:open="resultOpen"
      title="委派处理结果"
      :width="600"
      ok-text="关闭"
      hide-cancel
      modal-class="op-delegate-modal"
      @ok="resultOpen = false"
    >
      <table v-if="resultTask" class="dt-result">
        <tbody>
          <tr>
            <th>委派人</th><td>{{ resultTask.operator }}</td>
            <th>委派时间</th><td>{{ resultTask.batchAt }}</td>
          </tr>
          <tr>
            <th>任务说明</th><td colspan="3">{{ resultTask.task }}</td>
          </tr>
          <tr>
            <th>委派处理结果</th><td colspan="3">{{ resultTask.result }}</td>
          </tr>
        </tbody>
      </table>
    </OpActionModal>
  </div>
  </a-config-provider>
</template>

<style scoped>
.dt-panel {
  padding: 10px 14px;
  background: #f0f9eb;
  border: 1px solid #b3e19d;
  border-radius: 8px;
}
.dt-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dt-title {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; line-height: 20px; color: #383853;
}
.dt-bar { display: inline-block; width: 3px; height: 13px; background: #5d87ff; border-radius: 2px; }
.dt-link {
  display: inline-flex; align-items: center; gap: 4px; padding: 0;
  font-size: 13px; line-height: 20px; color: #67c23a;
  background: transparent; border: none; cursor: pointer; font-family: inherit;
}
.dt-link:hover { opacity: 0.85; }
.dt-body { margin-top: 4px; font-size: 13px; line-height: 20px; color: #529b2e; }
.dt-prog { font-weight: 500; }
.dt-mine { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px; }
.dt-mine-text { min-width: 0; font-size: 13px; line-height: 20px; color: #4d5875; }
.dt-btn {
  flex: none; height: 24px; padding: 0 10px;
  font-size: 12px; font-family: inherit; color: #fff;
  background: #5d87ff; border: 1px solid #5d87ff; border-radius: 4px; cursor: pointer;
}
.dt-btn:hover { opacity: 0.9; }

.batch-list { display: flex; flex-direction: column; gap: 12px; }
.batch-head { display: flex; align-items: center; gap: 8px; min-height: 22px; font-size: 13px; color: #606266; }
.batch-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #5d87ff; }
.batch-time { font-size: 13px; font-weight: 600; line-height: 20px; color: #303133; }
.batch-operator {
  display: inline-flex; gap: 4px; padding: 1px 8px 1px 6px;
  font-size: 12px; line-height: 18px; color: #606266; background: #f5f7fa; border-radius: 10px;
}
.batch-operator-label { color: #a8abb2; }
.batch-operator-name { font-weight: 500; color: #383853; }
.batch-count {
  padding: 1px 8px; font-size: 12px; font-weight: 500; line-height: 18px;
  color: #5d87ff; background: #eef3ff; border-radius: 10px;
}
.batch-items { padding-left: 6px; }
.batch-item {
  display: grid;
  grid-template-columns: 18px 148px minmax(0, 1fr) 60px;
  gap: 8px;
  align-items: center;
  min-height: 28px;
  padding-right: 8px;
  font-size: 13px;
  color: #4d5875;
}
.rail { position: relative; display: flex; align-items: center; justify-content: center; align-self: stretch; }
.rail::before { content: ''; position: absolute; top: 0; bottom: 0; left: -2px; width: 1px; background: #ebeef5; }
.rail-node { width: 7px; height: 7px; background: #fff; border: 1px solid #dcdfe6; border-radius: 50%; }
.col-assignee { font-weight: 500; line-height: 20px; color: #303133; overflow-wrap: anywhere; }
.col-task { line-height: 20px; color: #4d5875; overflow-wrap: anywhere; }
.dt-tag {
  display: inline-flex; align-items: center; height: 20px; padding: 0 7px;
  font-size: 12px; font-weight: 500; border: 1px solid; border-radius: 4px; white-space: nowrap;
}
.dt-tag.is-pending { color: #e6a23c; background: #fdf6ec; border-color: #faecd8; }
.dt-tag.is-done { color: #67c23a; background: #f0f9eb; border-color: #e1f3d8; }
.dt-tag.is-void { color: #909399; background: #f4f4f5; border-color: #e9e9eb; }

.dt-result { width: 100%; font-size: 13px; line-height: 20px; border-collapse: collapse; table-layout: fixed; }
.dt-result th,
.dt-result td { padding: 8px 12px; text-align: left; vertical-align: top; border: 1px solid #ebeef5; overflow-wrap: anywhere; }
.dt-result th { width: 110px; font-weight: 500; color: #606266; background: #f5f7fa; }
.dt-result td { color: #303133; }
</style>
