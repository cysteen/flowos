<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { message } from 'ant-design-vue';
import {
  SaveOutlined, ApiOutlined, CheckCircleOutlined,
  EditOutlined, FilterOutlined, SendOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { BUSINESS_TYPES, CREATE_TICKET_TYPES, TICKET_SOURCE_OPTIONS } from '@/views/tickets/types/createTicket';
import { PRODUCT_CATEGORIES } from '@/views/tickets/types/mineQuery';
import dayjs, { type Dayjs } from 'dayjs';

/** 本期仅非售后（type=2）；结案调研流程即《非售后工单短信调研回访流程》 */
interface FlowList {
  /** 不发（免调研）：工单类型 + 小结·话务性质（客户黑名单为客户档案属性、只读引用） */
  noType: string[];
  noNature: string[];
  /** 结案后调研：工单类型 + 产品分类 + 业务类型 + 工单来源 + 标记 */
  afterType: string[];
  afterProdCat: string[];
  afterBizType: string[];
  afterSource: string[];
  afterTag: string[];
}
interface Strategy {
  list: FlowList;
  sendStart: string; // 'HH:mm'
  sendEnd: string;
  feedbackHours: number;
}

/**
 * 各字段可选枚举取自项目已有枚举（工单类型/工单来源/产品分类）+ 业务补充值。
 * 勾选=纳入该分流判定；默认勾选业务规则命中的值。
 */
const TICKET_TYPE_OPTS = [...CREATE_TICKET_TYPES, '表扬'];                  // 投诉/建议/商机/咨询/表扬
const CALL_NATURE_OPTS = ['无', '无声通话', '非我司产品', '重复来电 - 不同问题', '重复来电 - 同一问题', '骚扰用户 - 纯骚扰', '骚扰用户 - 业务骚扰']; // 小结·话务性质
const PROD_CAT_OPTS = [...PRODUCT_CATEGORIES, '综合类问题'];                // 产品分类
const BIZ_TYPE_OPTS = [...BUSINESS_TYPES]; // 业务分类，与建单弹窗同源
const SOURCE_OPTS = [...TICKET_SOURCE_OPTIONS]; // 工单来源，与建单弹窗同源
const TAG_OPTS = ['二次下送'];                                             // 工单标记

const cur = reactive<Strategy>({
  list: {
    noType: ['投诉'],
    noNature: ['骚扰用户 - 纯骚扰', '骚扰用户 - 业务骚扰'],
    afterType: ['商机'],
    afterProdCat: ['综合类问题'],
    afterBizType: ['开放平台'],
    afterSource: ['学习机渠道'],
    afterTag: ['二次下送'],
  },
  sendStart: '08:00',
  sendEnd: '22:00',
  feedbackHours: 24,
});

/** 工单类型在「不发」与「结案后调研」两处共用同一枚举，互斥：一处勾选另一处禁选 */
function typeDisabledInAfter(v: string): boolean {
  return cur.list.noType.includes(v);
}
function typeDisabledInNo(v: string): boolean {
  return cur.list.afterType.includes(v);
}


// —— 对接参数（全局） ——
const conn = reactive({
  env: 'test' as 'test' | 'prod',
  deliverUrl: 'https://kdxf.example.com/api/kdxf/open/deliver/t1',
  signKey: '••••••••••••',
  callbackKey: '••••••••••••',
});
const signKeyEditing = ref(false);
const callbackKeyEditing = ref(false);


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
  if (hmToMinutes(s.sendStart) >= hmToMinutes(s.sendEnd)) return '发送窗口起始须早于结束';
  if (s.feedbackHours < 1) return '反馈窗口至少 1 小时';
  return null;
}

function onSave() {
  const err = validate();
  if (err) { message.error(err); return; }
  message.success('已保存调研策略与对接参数');
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
      title="调研配置"
      subtitle="维护非售后工单结案调研的分流名单、发送与反馈窗口；讯飞投放对接参数与回调验签配置。"
    >
      <template #actions>
        <a-button @click="onTestConn"><template #icon><ApiOutlined /></template>测试连通</a-button>
        <a-button type="primary" @click="onSave"><template #icon><SaveOutlined /></template>保存</a-button>
      </template>
    </AdminPageHeader>

    <div class="cfg-cols">
      <!-- 配置区（本期仅非售后 type=2） -->
      <div class="cfg-body">
        <!-- 分流名单（调研服务侧判定；结束方式判断属工单结案逻辑，不在此） -->
        <section class="cfg-card">
          <div class="cc-head"><FilterOutlined /><span>调研方式配置</span></div>
          <div class="cc-note">
            仅<strong>正常解决结案</strong>的工单进入调研（转售后 / 关闭 / 强结 / 取消不调用）；进入后按下列顺序判定，命中即停。
          </div>

          <div class="sub-block exempt">
            <div class="sb-title"><span class="dot dot-exempt" />不发（免调研）</div>
            <div class="sb-desc">建调研任务并记免调研原因，但不发短信，工单直接结案。三个维度任一命中即免调研（维度间、取值间均为「或」）。</div>
            <div class="chk-row">
              <span class="chk-label">工单类型</span>
              <a-checkbox-group v-model:value="cur.list.noType">
                <a-checkbox v-for="v in TICKET_TYPE_OPTS" :key="v" :value="v" :disabled="typeDisabledInNo(v)">{{ v }}</a-checkbox>
              </a-checkbox-group>
            </div>
            <div class="chk-row">
              <span class="chk-label">话务性质<br /><small>(工单小结)</small></span>
              <a-checkbox-group v-model:value="cur.list.noNature" :options="CALL_NATURE_OPTS" />
            </div>
            <div class="chk-row">
              <span class="chk-label">客户黑名单</span>
              <span class="ro-inline">当前手机号对应<strong>客户在黑名单</strong>即不发 · 取自客户档案（客户级），不在此维护</span>
            </div>
          </div>

          <div class="sub-block after">
            <div class="sb-title"><span class="dot dot-after" />结案后调研</div>
            <div class="sb-desc">先结案、后补发短信；反馈只记录。五个维度任一命中即入本分流（维度间、取值间均为「或」）。</div>
            <div class="chk-row">
              <span class="chk-label">工单类型</span>
              <a-checkbox-group v-model:value="cur.list.afterType">
                <a-checkbox v-for="v in TICKET_TYPE_OPTS" :key="v" :value="v" :disabled="typeDisabledInAfter(v)">{{ v }}</a-checkbox>
              </a-checkbox-group>
            </div>
            <div class="chk-row">
              <span class="chk-label">产品分类</span>
              <a-checkbox-group v-model:value="cur.list.afterProdCat" :options="PROD_CAT_OPTS" />
            </div>
            <div class="chk-row">
              <span class="chk-label">业务分类</span>
              <a-checkbox-group v-model:value="cur.list.afterBizType" :options="BIZ_TYPE_OPTS" />
            </div>
            <div class="chk-row">
              <span class="chk-label">工单来源</span>
              <a-checkbox-group v-model:value="cur.list.afterSource" :options="SOURCE_OPTS" />
            </div>
            <div class="chk-row">
              <span class="chk-label">工单标记</span>
              <a-checkbox-group v-model:value="cur.list.afterTag" :options="TAG_OPTS" />
            </div>
          </div>

          <div class="sub-block normal">
            <!-- 反馈窗时长随「反馈窗口」配置联动，不写死 -->
            <div class="sb-title"><span class="dot dot-normal" />调研后结案（普通工单）<span class="sb-hint">以上均未命中，无需配置</span></div>
            <div class="sb-desc">停待回访 → 发短信 → 开反馈窗。已解决 / 没有解决方案 / 无反馈 → 结案；方案没用、太复杂、没人联系 → 打回重分配。</div>
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
.sb-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.sub-block.normal .sb-desc { margin-bottom: 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dot-exempt { background: #dc2626; }
.dot-after { background: #d97706; }
.dot-normal { background: #16a34a; }
.sb-hint { font-size: 11px; font-weight: 400; color: #9ca3af; }
.sb-desc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.55;
  margin-bottom: 10px;
}
.chk-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.chk-row:last-child { margin-bottom: 0; }
.chk-label { font-size: 12px; color: #6b7280; width: 80px; flex: none; padding-top: 2px; line-height: 1.4; }
.chk-label small { font-size: 10px; color: #b0b6bf; }
.ro-inline { font-size: 12px; color: #9ca3af; line-height: 1.6; padding-top: 2px; }
.ro-inline strong { color: #6b7280; }

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
