<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  ArrowLeftOutlined, CopyOutlined, PhoneOutlined, StarOutlined,
  PrinterOutlined, EllipsisOutlined, CheckOutlined, MailOutlined,
} from '@ant-design/icons-vue';
import OpTimeline from './components/OpTimeline.vue';
import { TICKET_DETAIL, TIMELINE } from '@/mock/ticketDetail';

const route = useRoute();
const router = useRouter();
const d = TICKET_DETAIL;
const ticketNo = computed(() => (route.params.ticketNo as string) || d.no);

const steps = [
  { label: '待受理', state: 'done' },
  { label: '受理', state: 'done' },
  { label: '处理中', state: 'current' },
  { label: '待审核', state: 'future' },
  { label: '已解决', state: 'future' },
  { label: '归档', state: 'future' },
];

function back() {
  router.push('/tickets');
}
function act(name: string) {
  message.success(`「${name}」已执行（占位）`);
}
function call() {
  message.info(`正在呼叫客户 ${d.customer.phone}（CTI 占位）`);
}
function copyNo() {
  message.success('工单号已复制');
}
</script>

<template>
  <div class="op-page">
    <!-- 工单头 -->
    <div class="op-header">
      <div class="oh-left">
        <button class="back-btn" @click="back"><ArrowLeftOutlined /></button>
        <div class="oh-titles">
          <div class="oh-title">{{ d.title }}</div>
          <div class="oh-meta">
            <span class="oh-no">{{ ticketNo }}</span>
            <CopyOutlined class="copy" @click="copyNo" />
            <span class="tag tag-red">{{ d.type }}</span>
            <span class="oh-channel">· {{ d.channel }}</span>
            <span class="tag tag-red">{{ d.priority }}</span>
            <span class="tag tag-blue">{{ d.status }}</span>
          </div>
        </div>
      </div>
      <div class="oh-right">
        <div class="sla">
          <span class="sla-label">整单解决剩余</span>
          <span class="sla-val amber">{{ d.slaWhole }}</span>
        </div>
        <div class="sla-divider"></div>
        <div class="sla">
          <span class="sla-label">当前节点响应</span>
          <span class="sla-val" :class="d.slaNodeOverdue ? 'red' : 'amber'">{{ d.slaNode }}</span>
        </div>
        <button class="call-btn" @click="call"><PhoneOutlined />呼叫客户</button>
        <button class="icon-btn" @click="act('关注')"><StarOutlined /></button>
        <button class="icon-btn" @click="act('打印')"><PrinterOutlined /></button>
        <button class="icon-btn" @click="act('更多')"><EllipsisOutlined /></button>
      </div>
    </div>

    <!-- 状态流转条 -->
    <div class="op-stepper">
      <div class="stepper">
        <template v-for="(s, i) in steps" :key="s.label">
          <div class="step">
            <span class="step-dot" :class="s.state">
              <CheckOutlined v-if="s.state === 'done'" :style="{ color: '#fff', fontSize: '10px' }" />
              <span v-else-if="s.state === 'current'" class="inner-dot"></span>
            </span>
            <span class="step-label" :class="s.state">{{ s.label }}</span>
          </div>
          <span v-if="i < steps.length - 1" class="conn" :class="{ done: steps[i + 1].state !== 'future' || s.state === 'done' }"></span>
        </template>
      </div>
      <span class="next-pill">下一步：标记已解决</span>
    </div>

    <!-- Body：左主区 + 右栏 -->
    <div class="op-body">
      <div class="op-main">
        <!-- 催单提醒带 -->
        <div class="dunning-band">
          <span class="db-icon">🔔</span>
          <span class="db-text">客户已催单 {{ d.dunningTimes }} 次（最近 {{ d.dunningLast }}），情绪偏急，建议优先处理</span>
          <span class="db-link" @click="act('查看催单记录')">查看催单记录 ›</span>
        </div>

        <!-- 工单详情卡 -->
        <div class="detail-card">
          <div class="dc-title">工单详情 · 一线建单信息</div>
          <div class="dc-meta">
            <span><b>建单人</b> {{ d.builder }}</span>
            <span><b>来源</b> {{ d.source }}</span>
            <span><b>建单时间</b> {{ d.createdAt }}</span>
          </div>
          <div class="dc-demand">
            <div class="dc-label">客户诉求</div>
            <div class="dc-demand-text">{{ d.demand }}</div>
          </div>
          <div class="dc-fields">
            <div v-for="f in d.fields" :key="f.label" class="dc-field">
              <span class="dc-field-label">{{ f.label }}</span>
              <span class="dc-field-value">{{ f.value }}</span>
            </div>
          </div>
          <div class="dc-attachments">
            <span v-for="a in d.attachments" :key="a" class="dc-attach">📎 {{ a }}</span>
          </div>
        </div>

        <!-- 工单动态时间线 -->
        <OpTimeline :entries="TIMELINE" />
      </div>

      <div class="op-side">
        <!-- 客户卡 -->
        <div class="side-card">
          <div class="cust-top">
            <span class="cust-av">{{ d.customer.name.charAt(0) }}</span>
            <div class="cust-id">
              <div class="cust-name-row">
                <span class="cust-name">{{ d.customer.name }}</span>
                <span v-if="d.customer.vip" class="vip">VIP</span>
              </div>
              <div class="cust-level">{{ d.customer.level }}</div>
            </div>
          </div>
          <div class="cust-row">
            <PhoneOutlined :style="{ color: '#9CA3AF', fontSize: '13px' }" />
            <span>{{ d.customer.phone }}</span>
            <span class="call-mini" @click="call">呼叫</span>
          </div>
          <div class="cust-row">
            <MailOutlined :style="{ color: '#9CA3AF', fontSize: '13px' }" />
            <span>{{ d.customer.email }}</span>
          </div>
          <div class="cust-emotion">
            <span class="ce-label">客户情绪</span>
            <span class="ce-tag">{{ d.customer.emotion }}</span>
          </div>
          <div class="cust-history">
            <span>历史工单 {{ d.customer.historyCount }} 单 · 近30天 {{ d.customer.recent30 }} 单</span>
            <span class="link" @click="act('查看历史工单')">查看 ›</span>
          </div>
        </div>

        <!-- 产品卡 -->
        <div class="side-card">
          <div class="card-title-row">
            <span class="card-title">产品信息</span>
            <span v-if="d.product.inWarranty" class="warranty">保修中</span>
          </div>
          <div class="kv"><span class="k">产品</span><span class="v">{{ d.product.name }}</span></div>
          <div class="kv"><span class="k">SN</span><span class="v">{{ d.product.sn }}</span></div>
          <div class="kv"><span class="k">保修至</span><span class="v">{{ d.product.warranty }}</span></div>
        </div>

        <!-- 关联工单 -->
        <div class="side-card">
          <div class="card-title">关联工单</div>
          <div v-for="r in d.related" :key="r.no" class="related-item" @click="act('打开 ' + r.no)">
            <div class="related-top">
              <span class="related-no">{{ r.no }}</span>
              <span class="related-tag">{{ r.tag }}</span>
            </div>
            <div class="related-title">{{ r.title }}</div>
          </div>
        </div>

        <!-- AI 助手 -->
        <div class="side-card ai-card">
          <div class="ai-title">⚡ AI 助手</div>
          <div class="ai-block">
            <div class="ai-sub">AI 摘要</div>
            <div class="ai-text">客户反映 X1 音箱在线歌单频繁跳歌、重启无效，情绪中性偏急，产品保修内。</div>
          </div>
          <div class="ai-sub">知识推荐</div>
          <div v-for="(k, i) in ['X1 跳歌问题排查指引', '固件 3.3.0 升级说明', '音箱在线播放常见问题']" :key="i" class="ai-know">
            <span class="ai-know-text">{{ k }}</span>
            <span class="ai-adopt">采纳</span>
          </div>
        </div>

        <div class="side-spacer"></div>

        <!-- 添加记录 -->
        <div class="side-card add-card">
          <div class="add-top">
            <span class="add-title">添加记录</span>
            <div class="add-tabs">
              <span class="add-tab active">备注</span>
              <span class="add-tab">补充信息</span>
            </div>
          </div>
          <textarea class="add-textarea" placeholder="填写内部备注（仅团队可见）…"></textarea>
          <div class="add-foot">
            <span class="add-hint">📎 附件</span>
            <button class="add-btn" @click="act('添加记录')">添加</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作条 -->
    <div class="op-actionbar">
      <div class="ab-left">
        <button class="btn-outline" @click="act('保存草稿')">保存草稿</button>
      </div>
      <div class="ab-right">
        <button class="btn-outline" @click="act('转办')">转办</button>
        <button class="btn-outline" @click="act('挂起')">挂起</button>
        <button class="btn-outline" @click="act('退回')">退回</button>
        <button class="btn-outline" @click="act('升级')">升级</button>
        <button class="btn-resolve" @click="act('标记已解决')">标记已解决</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.op-page { display: flex; flex-direction: column; min-height: 100%; }

/* 工单头 */
.op-header {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; padding: 14px 24px; border-bottom: 1px solid #e5e7eb;
}
.oh-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.back-btn {
  width: 32px; height: 32px; border: 1px solid #e5e7eb; border-radius: 6px;
  background: #fff; color: #6b7280; cursor: pointer; flex: none;
}
.back-btn:hover { background: #f3f4f6; }
.oh-titles { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.oh-title { font-size: 16px; font-weight: 700; color: #111827; }
.oh-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.oh-no { font-size: 12px; color: #9ca3af; }
.copy { color: #9ca3af; font-size: 13px; cursor: pointer; }
.oh-channel { font-size: 12px; color: #9ca3af; }
.tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.tag-red { color: #ef4444; background: #ef44441f; }
.tag-blue { color: #1a6fff; background: #1a6fff1f; }

.oh-right { display: flex; align-items: center; gap: 20px; flex: none; }
.sla { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.sla-label { font-size: 11px; color: #9ca3af; }
.sla-val { font-size: 16px; font-weight: 700; }
.sla-val.amber { color: #f59e0b; }
.sla-val.red { color: #ef4444; }
.sla-divider { width: 1px; height: 30px; background: #e5e7eb; }
.call-btn {
  display: flex; align-items: center; gap: 6px; padding: 8px 14px;
  background: #10b981; color: #fff; border: none; border-radius: 6px;
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.call-btn:hover { background: #059669; }
.icon-btn {
  width: 32px; height: 32px; border: 1px solid #e5e7eb; border-radius: 6px;
  background: #f9fafb; color: #6b7280; cursor: pointer;
}
.icon-btn:hover { background: #f3f4f6; }

/* 状态流转条 */
.op-stepper {
  display: flex; align-items: center; gap: 16px;
  background: #fff; padding: 14px 24px; border-bottom: 1px solid #e5e7eb;
}
.stepper { flex: 1; display: flex; align-items: center; }
.step { display: flex; align-items: center; gap: 6px; flex: none; }
.step-dot {
  width: 18px; height: 18px; border-radius: 9px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: #fff; border: 1px solid #d1d5db;
}
.step-dot.done { background: #1a6fff; border-color: #1a6fff; }
.step-dot.current { border: 2px solid #1a6fff; }
.inner-dot { width: 7px; height: 7px; border-radius: 4px; background: #1a6fff; }
.step-label { font-size: 12px; color: #9ca3af; }
.step-label.done { color: #374151; }
.step-label.current { color: #374151; font-weight: 600; }
.conn { flex: 1; height: 2px; background: #e5e7eb; margin: 0 4px; }
.conn.done { background: #1a6fff; }
.next-pill {
  flex: none; font-size: 12px; font-weight: 600; color: #059669;
  background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 6px 12px;
}

/* Body */
.op-body { display: flex; gap: 16px; padding: 20px; flex: 1; }
.op-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.op-side { width: 360px; flex: none; display: flex; flex-direction: column; gap: 16px; }

/* 催单带 */
.dunning-band {
  display: flex; align-items: center; gap: 10px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px;
}
.db-icon { font-size: 14px; }
.db-text { flex: 1; font-size: 13px; font-weight: 500; color: #b91c1c; }
.db-link { font-size: 13px; font-weight: 600; color: #dc2626; cursor: pointer; }

/* 工单详情卡 */
.detail-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.dc-title { font-size: 15px; font-weight: 700; color: #111827; }
.dc-meta { display: flex; flex-wrap: wrap; gap: 18px; font-size: 12px; color: #6b7280; }
.dc-meta b { color: #9ca3af; font-weight: 400; margin-right: 4px; }
.dc-demand { background: #f9fafb; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.dc-label { font-size: 12px; font-weight: 600; color: #6b7280; }
.dc-demand-text { font-size: 13px; color: #374151; line-height: 1.6; }
.dc-fields { display: flex; flex-wrap: wrap; gap: 8px; }
.dc-field { display: flex; align-items: center; gap: 6px; background: #f3f4f6; border-radius: 6px; padding: 6px 10px; }
.dc-field-label { font-size: 11px; color: #9ca3af; }
.dc-field-value { font-size: 12px; color: #374151; font-weight: 500; }
.dc-attachments { display: flex; gap: 8px; flex-wrap: wrap; }
.dc-attach { font-size: 12px; color: #374151; background: #f3f4f6; border-radius: 6px; padding: 6px 10px; }

/* 右栏卡片 */
.side-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.card-title-row { display: flex; align-items: center; justify-content: space-between; }
.card-title { font-size: 14px; font-weight: 700; color: #111827; }
.warranty { font-size: 11px; color: #10b981; background: #ecfdf5; padding: 2px 8px; border-radius: 3px; }

.cust-top { display: flex; align-items: center; gap: 10px; }
.cust-av { width: 40px; height: 40px; border-radius: 20px; background: #1a6fff22; color: #1a6fff; font-weight: 600; display: flex; align-items: center; justify-content: center; }
.cust-name-row { display: flex; align-items: center; gap: 6px; }
.cust-name { font-size: 14px; font-weight: 600; color: #111827; }
.vip { font-size: 11px; font-weight: 600; color: #b45309; background: #fef3c7; padding: 1px 7px; border-radius: 4px; }
.cust-level { font-size: 12px; color: #9ca3af; }
.cust-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #374151; }
.call-mini { margin-left: auto; font-size: 11px; color: #10b981; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px; padding: 2px 8px; cursor: pointer; }
.cust-emotion { display: flex; align-items: center; gap: 10px; }
.ce-label { font-size: 12px; color: #6b7280; }
.ce-tag { font-size: 12px; color: #6b7280; background: #6b72801f; border: 1px solid #6b7280; border-radius: 12px; padding: 2px 12px; }
.cust-history { display: flex; align-items: center; justify-content: space-between; background: #f9fafb; border-radius: 6px; padding: 8px 10px; font-size: 12px; color: #6b7280; }
.link { color: #1a6fff; cursor: pointer; }

.kv { display: flex; gap: 8px; font-size: 12px; }
.kv .k { color: #9ca3af; width: 48px; flex: none; }
.kv .v { color: #374151; font-weight: 500; }

.related-item { background: #f9fafb; border-radius: 6px; padding: 10px; cursor: pointer; }
.related-item:hover { background: #f3f4f6; }
.related-top { display: flex; align-items: center; justify-content: space-between; }
.related-no { font-size: 12px; color: #1a6fff; font-weight: 500; }
.related-tag { font-size: 10px; color: #6b7280; background: #eef0f2; border-radius: 3px; padding: 1px 6px; }
.related-title { font-size: 12px; color: #6b7280; margin-top: 3px; }

.ai-card { background: #f5f3ff; border-color: #ddd6fe; }
.ai-title { font-size: 14px; font-weight: 700; color: #6d28d9; }
.ai-block { background: #fff; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
.ai-sub { font-size: 11px; font-weight: 600; color: #7c3aed; }
.ai-text { font-size: 12px; color: #374151; line-height: 1.6; }
.ai-know { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff; border-radius: 6px; padding: 8px 10px; }
.ai-know-text { font-size: 12px; color: #374151; }
.ai-adopt { font-size: 11px; color: #fff; background: #7c3aed; border-radius: 4px; padding: 3px 10px; cursor: pointer; flex: none; }

.side-spacer { flex: 1; }

.add-card { border-radius: 12px; }
.add-top { display: flex; align-items: center; justify-content: space-between; }
.add-title { font-size: 14px; font-weight: 700; color: #111827; }
.add-tabs { display: flex; gap: 2px; background: #f3f4f6; border-radius: 6px; padding: 2px; }
.add-tab { font-size: 12px; color: #6b7280; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
.add-tab.active { background: #fff; color: #1a6fff; font-weight: 600; }
.add-textarea { height: 80px; resize: none; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 12px; color: #374151; outline: none; font-family: inherit; }
.add-textarea::placeholder { color: #9ca3af; }
.add-foot { display: flex; align-items: center; justify-content: space-between; }
.add-hint { font-size: 12px; color: #6b7280; cursor: pointer; }
.add-btn { font-size: 13px; color: #fff; background: #1a6fff; border: none; border-radius: 6px; padding: 6px 18px; cursor: pointer; }

/* 底部操作条 */
.op-actionbar {
  position: sticky; bottom: 0;
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; padding: 12px 24px; border-top: 1px solid #e5e7eb;
}
.ab-right { display: flex; gap: 10px; }
.ab-left { display: flex; gap: 10px; }
.btn-outline { font-size: 13px; color: #374151; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; padding: 9px 16px; cursor: pointer; }
.btn-outline:hover { border-color: #1a6fff; color: #1a6fff; }
.btn-resolve { font-size: 13px; font-weight: 600; color: #fff; background: #10b981; border: none; border-radius: 6px; padding: 9px 16px; cursor: pointer; }
.btn-resolve:hover { background: #059669; }
</style>
