<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { message } from 'ant-design-vue';
import {
  SaveOutlined, ApiOutlined, CheckCircleOutlined,
  EditOutlined, FilterOutlined, SendOutlined, RedoOutlined, PhoneOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import dayjs, { type Dayjs } from 'dayjs';

/** 本期仅非售后（type=2）；结案调研流程即《非售后工单短信调研回访流程》 */
interface FlowList {
  /** 免调研结案：结单方式 + 工单标记 */
  exemptClose: string[];
  exemptTag: string[];
  /** 结案后调研：渠道业务 + 工单标记 */
  afterChannel: string[];
  afterTag: string[];
}
interface Strategy {
  list: FlowList;
  sendStart: string; // 'HH:mm'
  sendEnd: string;
  feedbackHours: number;
  secondEnabled: boolean;
  secondDays: number;
  fatigueEnabled: boolean;
  fatigueDays: number;
}

const CLOSE_WAYS = ['关闭', '取消', '强制结单'];
const EXEMPT_TAGS = ['投诉', '黑名单', '骚扰'];
const AFTER_CHANNELS = ['商机', '开放平台', '学习机渠道', '综合问题'];
const AFTER_TAGS = ['免回访', '二次下送'];

const cur = reactive<Strategy>({
  list: {
    exemptClose: [...CLOSE_WAYS],
    exemptTag: [...EXEMPT_TAGS],
    afterChannel: [...AFTER_CHANNELS],
    afterTag: [...AFTER_TAGS],
  },
  sendStart: '08:00',
  sendEnd: '22:00',
  feedbackHours: 24,
  secondEnabled: true,
  secondDays: 7,
  fatigueEnabled: false,
  fatigueDays: 30,
});

const NUMBER_PRIORITY = '用户最终联系号码 > 电话3 > 电话2 > 联系电话';

// —— 对接参数（全局） ——
const conn = reactive({
  env: 'test' as 'test' | 'prod',
  deliverUrl: 'https://kdxf.example.com/api/kdxf/open/deliver/t1',
  signKey: '••••••••••••',
  callbackKey: '••••••••••••',
});
const signKeyEditing = ref(false);
const callbackKeyEditing = ref(false);

/** 结案后调研名单里、若某枚举已勾进免调研 → 该项在结案后调研区置灰（互斥） */
function afterChannelDisabled(v: string): boolean {
  return cur.list.exemptClose.includes(v) || cur.list.exemptTag.includes(v);
}
function afterTagDisabled(v: string): boolean {
  return cur.list.exemptTag.includes(v);
}

function hmToDayjs(hm: string): Dayjs {
  const [h, m] = hm.split(':').map(Number);
  return dayjs().hour(h).minute(m).second(0).millisecond(0);
}
function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
const timeStart = computed<Dayjs>({
  get: () => hmToDayjs(cur.sendStart),
  set: (d) => { if (d) cur.sendStart = d.format('HH:mm'); },
});
const timeEnd = computed<Dayjs>({
  get: () => hmToDayjs(cur.sendEnd),
  set: (d) => { if (d) cur.sendEnd = d.format('HH:mm'); },
});

function validate(): string | null {
  const s = cur;
  // 互斥：同一标记不可既免调研又结案后调研
  const dup = s.list.afterTag.filter((t) => s.list.exemptTag.includes(t));
  if (dup.length) return `标记「${dup.join('、')}」不能同时在免调研与结案后调研名单`;
  if (hmToMinutes(s.sendStart) >= hmToMinutes(s.sendEnd)) return '发送窗口起始须早于结束';
  if (s.feedbackHours < 1) return '反馈窗口至少 1 小时';
  if (s.secondEnabled && s.secondDays < 1) return '二次调研天数须为正整数';
  return null;
}

function onSave() {
  const err = validate();
  if (err) { message.error(err); return; }
  message.success('已保存调研回访策略与对接参数');
}

function onTestConn() {
  message.loading({ content: '正在测试连通…', key: 'conn' });
  setTimeout(() => {
    message.success({ content: '连接成功（code=0）', key: 'conn' });
  }, 700);
}

function saveSignKey() { signKeyEditing.value = false; message.success('签名密钥已更新'); }
function saveCallbackKey() { callbackKeyEditing.value = false; message.success('回调验签密钥已更新'); }
</script>

<template>
  <div class="survey-config">
    <AdminPageHeader
      title="调研回访配置"
      subtitle="维护非售后工单结案调研的分流名单、发送与反馈窗口、二次调研与触达治理；讯飞投放对接参数与回调验签配置。"
    >
      <template #actions>
        <a-button @click="onTestConn"><template #icon><ApiOutlined /></template>测试连通</a-button>
        <a-button type="primary" @click="onSave"><template #icon><SaveOutlined /></template>保存</a-button>
      </template>
    </AdminPageHeader>

    <div class="cfg-cols">
      <!-- 配置区（本期仅非售后 type=2） -->
      <div class="cfg-body">
        <!-- 分流名单 -->
        <section class="cfg-card">
          <div class="cc-head"><FilterOutlined /><span>分流名单</span></div>
          <div class="cc-note">结案时按下列名单判定：免调研 &gt; 结案后调研 &gt; 普通工单（命中即停）。</div>

          <div class="sub-block exempt">
            <div class="sb-title"><span class="dot dot-exempt" />免调研结案<span class="sb-hint">命中即结案、不发短信</span></div>
            <div class="chk-row">
              <span class="chk-label">结单方式</span>
              <a-checkbox-group v-model:value="cur.list.exemptClose" :options="CLOSE_WAYS" />
            </div>
            <div class="chk-row">
              <span class="chk-label">工单标记</span>
              <a-checkbox-group v-model:value="cur.list.exemptTag" :options="EXEMPT_TAGS" />
            </div>
          </div>

          <div class="sub-block after">
            <div class="sb-title"><span class="dot dot-after" />结案后调研<span class="sb-hint">先结案、补发短信，反馈不回流</span></div>
            <div class="chk-row">
              <span class="chk-label">渠道 / 业务</span>
              <a-checkbox-group v-model:value="cur.list.afterChannel">
                <a-checkbox
                  v-for="v in AFTER_CHANNELS" :key="v" :value="v"
                  :disabled="afterChannelDisabled(v)"
                >{{ v }}</a-checkbox>
              </a-checkbox-group>
            </div>
            <div class="chk-row">
              <span class="chk-label">工单标记</span>
              <a-checkbox-group v-model:value="cur.list.afterTag">
                <a-checkbox
                  v-for="v in AFTER_TAGS" :key="v" :value="v"
                  :disabled="afterTagDisabled(v)"
                >
                  {{ v }}
                  <span v-if="afterTagDisabled(v)" class="mutex-hint">已在免调研名单</span>
                </a-checkbox>
              </a-checkbox-group>
            </div>
          </div>

          <div class="sub-block normal">
            <div class="sb-title"><span class="dot dot-normal" />普通工单<span class="sb-hint">以上均未命中 → 发短信 → 24h 反馈窗 → 反馈驱动结案/退回</span></div>
          </div>
        </section>

        <!-- 发送与反馈 -->
        <section class="cfg-card">
          <div class="cc-head"><SendOutlined /><span>发送与反馈</span></div>
          <div class="form-line">
            <span class="fl-label">发送窗口</span>
            <a-time-picker v-model:value="timeStart" format="HH:mm" :minute-step="30" class="tp" />
            <span class="fl-sep">至</span>
            <a-time-picker v-model:value="timeEnd" format="HH:mm" :minute-step="30" class="tp" />
            <span class="fl-tip">窗外任务缓存、顺延次日窗口开启后下发</span>
          </div>
          <div class="form-line">
            <span class="fl-label">反馈窗口</span>
            <a-input-number v-model:value="cur.feedbackHours" :min="1" :max="168" class="num" />
            <span class="fl-unit">小时</span>
            <span class="fl-tip">从投放成功起算；普通工单无反馈自动结案</span>
          </div>
          <div class="warn-line"><EditOutlined /> 时段 / 窗口修改仅对新任务生效，不影响已生成任务。</div>
        </section>

        <!-- 二次调研 -->
        <section class="cfg-card">
          <div class="cc-head"><RedoOutlined /><span>二次调研（times=2）</span></div>
          <div class="form-line">
            <span class="fl-label">启用</span>
            <a-switch v-model:checked="cur.secondEnabled" checked-children="开" un-checked-children="关" />
            <template v-if="cur.secondEnabled">
              <span class="fl-sep">结案后</span>
              <a-input-number v-model:value="cur.secondDays" :min="1" :max="90" class="num" />
              <span class="fl-unit">天发起</span>
            </template>
            <span class="fl-tip">二次调研纯数据收集，不改变工单状态</span>
          </div>
        </section>

        <!-- 触达治理 -->
        <section class="cfg-card">
          <div class="cc-head"><PhoneOutlined /><span>触达治理</span></div>
          <div class="form-line">
            <span class="fl-label">频控</span>
            <a-switch v-model:checked="cur.fatigueEnabled" checked-children="开" un-checked-children="关" />
            <template v-if="cur.fatigueEnabled">
              <span class="fl-sep">同手机号</span>
              <a-input-number v-model:value="cur.fatigueDays" :min="1" :max="365" class="num" />
              <span class="fl-unit">天最多 1 次</span>
            </template>
          </div>
          <div class="form-line">
            <span class="fl-label">号码优先级</span>
            <span class="ro-value">{{ NUMBER_PRIORITY }}</span>
          </div>
        </section>

        <!-- 对接参数（全局） -->
        <section class="cfg-card global">
          <div class="cc-head"><ApiOutlined /><span>讯飞投放对接参数</span></div>
          <div class="form-line">
            <span class="fl-label">环境</span>
            <a-radio-group v-model:value="conn.env" button-style="solid" size="small">
              <a-radio-button value="test">测试</a-radio-button>
              <a-radio-button value="prod">生产</a-radio-button>
            </a-radio-group>
          </div>
          <div class="form-line">
            <span class="fl-label">投放 URL</span>
            <a-input v-model:value="conn.deliverUrl" class="url-input" />
          </div>
          <div class="form-line">
            <span class="fl-label">签名密钥</span>
            <template v-if="signKeyEditing">
              <a-input-password v-model:value="conn.signKey" class="key-input" placeholder="输入新签名密钥" />
              <a-button size="small" type="link" @click="saveSignKey">确定</a-button>
            </template>
            <template v-else>
              <span class="key-mask">{{ conn.signKey }}</span>
              <a-button size="small" type="link" @click="signKeyEditing = true"><template #icon><EditOutlined /></template>改</a-button>
            </template>
          </div>
          <div class="form-line">
            <span class="fl-label">回调验签密钥</span>
            <template v-if="callbackKeyEditing">
              <a-input-password v-model:value="conn.callbackKey" class="key-input" placeholder="输入新回调验签密钥" />
              <a-button size="small" type="link" @click="saveCallbackKey">确定</a-button>
            </template>
            <template v-else>
              <span class="key-mask">{{ conn.callbackKey }}</span>
              <a-button size="small" type="link" @click="callbackKeyEditing = true"><template #icon><EditOutlined /></template>改</a-button>
            </template>
          </div>
          <div class="conn-tip"><CheckCircleOutlined /> 配好密钥后点右上「测试连通」自检，返回 code=0 即通。</div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.survey-config { padding: 16px 20px; }
.cfg-cols { display: flex; gap: 16px; align-items: flex-start; }
.cfg-body { flex: 1; min-width: 0; max-width: 920px; display: flex; flex-direction: column; gap: 14px; }
.cfg-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; }
.cfg-card.global { background: #fbfcfe; }
.cc-head {
  display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #111827;
  margin-bottom: 12px;
}
.cc-head :deep(.anticon) { color: #1a6fff; }
.cc-note { font-size: 12px; color: #9ca3af; margin-bottom: 14px; line-height: 1.6; }

.sub-block { padding: 12px 14px; border-radius: 8px; margin-bottom: 10px; }
.sub-block.exempt { background: #fef7f7; border: 1px solid #fde8e8; }
.sub-block.after { background: #fffbeb; border: 1px solid #fdefc7; }
.sub-block.normal { background: #f0f9f4; border: 1px solid #d7f0e0; margin-bottom: 0; }
.sb-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 10px; }
.sub-block.normal .sb-title { margin-bottom: 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dot-exempt { background: #dc2626; }
.dot-after { background: #d97706; }
.dot-normal { background: #16a34a; }
.sb-hint { font-size: 11px; font-weight: 400; color: #9ca3af; }
.chk-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.chk-row:last-child { margin-bottom: 0; }
.chk-label { font-size: 12px; color: #6b7280; width: 68px; flex: none; padding-top: 2px; }
.mutex-hint { font-size: 11px; color: #dc2626; margin-left: 4px; }

.form-line { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.form-line:last-child { margin-bottom: 0; }
.fl-label { font-size: 13px; color: #374151; width: 88px; flex: none; }
.fl-sep { font-size: 13px; color: #6b7280; }
.fl-unit { font-size: 13px; color: #6b7280; }
.fl-tip { font-size: 12px; color: #9ca3af; }
.tp { width: 108px; }
.num { width: 88px; }
.url-input { max-width: 420px; }
.key-input { width: 240px; }
.key-mask { font-size: 13px; color: #6b7280; letter-spacing: 2px; font-family: monospace; }
.ro-value { font-size: 13px; color: #4b5563; }
.warn-line {
  display: flex; align-items: center; gap: 6px; margin-top: 4px;
  font-size: 12px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a;
  padding: 6px 10px; border-radius: 6px;
}
.warn-line :deep(.anticon) { color: #d97706; }
.conn-tip {
  display: flex; align-items: center; gap: 6px; margin-top: 6px;
  font-size: 12px; color: #16a34a;
}
.conn-tip :deep(.anticon) { color: #16a34a; }
</style>
