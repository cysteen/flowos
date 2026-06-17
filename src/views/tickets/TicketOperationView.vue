<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  CopyOutlined, PhoneOutlined, StarOutlined,
  PrinterOutlined, EllipsisOutlined, MailOutlined,
  PaperClipOutlined, FormOutlined, ThunderboltOutlined, BookOutlined,
} from '@ant-design/icons-vue';
import OpTimeline from './components/OpTimeline.vue';
import { TICKET_DETAIL, TIMELINE } from '@/mock/ticketDetail';

const route = useRoute();
const d = TICKET_DETAIL;
const ticketNo = computed(() => (route.params.ticketNo as string) || d.no);

const EMOTIONS = ['满意', '中性', '不满', '愤怒'] as const;

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
        <div class="oh-titles">
          <div class="title-row">
            <span class="status-pill">{{ d.status }}</span>
            <span class="oh-title">{{ d.title }}</span>
          </div>
          <div class="oh-meta">
            <span class="oh-no">{{ ticketNo }}</span>
            <CopyOutlined class="copy" @click="copyNo" />
            <span class="tag tag-red">{{ d.type }}</span>
            <span class="oh-channel">· {{ d.channel }}</span>
            <span class="tag tag-red">{{ d.priority }}</span>
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

    <!-- Body：左主区 + 右栏 -->
    <div class="op-body">
      <div class="op-main">
        <div class="dunning-band">
          <span class="db-icon">🔔</span>
          <span class="db-text">客户已催单 {{ d.dunningTimes }} 次（最近 {{ d.dunningLast }}），情绪偏急，建议优先处理</span>
          <span class="db-link" @click="act('查看催单记录')">查看催单记录 ›</span>
        </div>

        <div class="detail-card">
          <div class="dc-title">工单详情 · 一线建单信息</div>
          <div class="dc-meta-grid">
            <div class="dc-meta-item"><span class="k">建单人</span><span class="v">{{ d.builder }}</span></div>
            <div class="dc-meta-item"><span class="k">来源渠道</span><span class="v">{{ d.source }}</span></div>
            <div class="dc-meta-item"><span class="k">建单时间</span><span class="v">{{ d.createdAt }}</span></div>
            <div class="dc-meta-item"><span class="k">投诉类型</span><span class="v">{{ d.complaintType }}</span></div>
            <div class="dc-meta-item"><span class="k">期望解决</span><span class="v">{{ d.expectedResolve }}</span></div>
          </div>
          <div class="dc-demand">
            <div class="dc-label">客户诉求</div>
            <div class="dc-demand-text">{{ d.demand }}</div>
          </div>
          <div class="dc-attachments">
            <span v-for="a in d.attachments" :key="a" class="dc-attach">
              <PaperClipOutlined :style="{ fontSize: '13px', color: '#6B7280' }" />{{ a }}
            </span>
          </div>
        </div>

        <OpTimeline :entries="TIMELINE" />
      </div>

      <div class="op-side">
        <!-- 客户信息 -->
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
            <span
              v-for="e in EMOTIONS"
              :key="e"
              class="ce-pill"
              :class="{ active: d.customer.emotion === e }"
            >{{ e }}</span>
          </div>
          <div class="cust-history">
            <span>历史工单 {{ d.customer.historyCount }} 单 · 近30天 {{ d.customer.recent30 }} 单</span>
            <span class="link" @click="act('查看历史工单')">查看 ›</span>
          </div>
        </div>

        <!-- 产品信息 -->
        <div class="side-card">
          <div class="card-title-row">
            <span class="card-title">产品信息</span>
            <span v-if="d.product.inWarranty" class="warranty">保修内</span>
          </div>
          <div class="kv"><span class="k">产品</span><span class="v">{{ d.product.name }}</span></div>
          <div class="kv"><span class="k">SN</span><span class="v">{{ d.product.sn }}</span></div>
          <div class="kv"><span class="k">保修至</span><span class="v">{{ d.product.warranty }}</span></div>
        </div>

        <!-- 关联工单 -->
        <div class="side-card">
          <div class="card-title">关联工单</div>

          <div class="sub-section">
            <div class="sub-head">
              <span class="sub-title">子工单 ({{ d.childTickets.length }})</span>
              <span class="sub-action" @click="act('新建子单')">+ 新建子单</span>
            </div>
            <div
              v-for="c in d.childTickets"
              :key="c.no"
              class="ticket-item"
              @click="act('打开 ' + c.no)"
            >
              <div class="ticket-item-top">
                <span class="ticket-no">{{ c.no }}</span>
                <span class="ticket-tags">
                  <span class="mini-tag" :style="{ color: c.typeColor, background: c.typeColor + '22' }">{{ c.typeTag }}</span>
                  <span class="mini-tag" :style="{ color: c.statusColor, background: c.statusColor + '22' }">{{ c.statusTag }}</span>
                </span>
              </div>
              <div class="ticket-item-bottom">
                <span class="ticket-item-title">{{ c.title }}</span>
                <span class="ticket-item-time">{{ c.time }}</span>
              </div>
            </div>
          </div>

          <div class="section-divider"></div>

          <div class="sub-section">
            <div class="sub-head">
              <span class="sub-title">关联记录 ({{ d.linkedRecords.length }})</span>
              <span class="sub-btns">
                <button class="mini-btn" @click="act('关联历史')">关联历史</button>
                <button class="mini-btn" @click="act('重新建单')">重新建单</button>
              </span>
            </div>
            <div
              v-for="r in d.linkedRecords"
              :key="r.no"
              class="ticket-item"
              @click="act('打开 ' + r.no)"
            >
              <div class="ticket-item-top">
                <span class="ticket-no">{{ r.no }}</span>
                <span class="mini-tag link-tag">{{ r.tag }}</span>
              </div>
              <div class="ticket-item-title solo">{{ r.title }}</div>
              <div class="ticket-item-bottom">
                <span class="ticket-item-time">{{ r.meta }}</span>
                <span class="unlink" @click.stop="act('解除关联')">解除关联</span>
              </div>
            </div>
          </div>
        </div>

        <!-- AI 助手 -->
        <div class="side-card ai-card">
          <div class="ai-title"><ThunderboltOutlined /> AI 助手</div>

          <div class="ai-sub">相似工单挖掘</div>
          <div class="similar-card">
            <div class="similar-top">
              <span class="ticket-no">{{ d.similarTicket.no }}</span>
              <span class="sim-tag">{{ d.similarTicket.similarity }}</span>
            </div>
            <div class="similar-title">{{ d.similarTicket.title }}</div>
            <div class="similar-solution">{{ d.similarTicket.solution }}</div>
            <div class="similar-actions">
              <button class="btn-ghost-purple" @click="act('查看方案')">查看</button>
              <button class="btn-purple" @click="act('复用方案')">复用方案</button>
            </div>
          </div>

          <div class="ai-sub">知识推荐</div>
          <div v-for="(k, i) in d.knowledge" :key="i" class="ai-know">
            <span class="ai-know-text"><BookOutlined :style="{ color: '#7C3AED', fontSize: '13px' }" />{{ k }}</span>
            <span class="ai-adopt" @click="act('采纳知识')">采纳</span>
          </div>

          <div class="ai-block">
            <div class="ai-sub">AI 摘要</div>
            <div class="ai-text">{{ d.aiSummary }}</div>
          </div>
        </div>

        <div class="side-spacer"></div>

        <!-- 添加记录 -->
        <div class="side-card add-card">
          <div class="add-top">
            <span class="add-title"><FormOutlined /> 添加记录</span>
            <div class="add-tabs">
              <span class="add-tab active">备注</span>
              <span class="add-tab">补充信息</span>
            </div>
          </div>
          <textarea class="add-textarea" placeholder="填写内部备注（仅团队可见）…"></textarea>
          <div class="add-foot">
            <span class="add-hint"><PaperClipOutlined /> 附件</span>
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

.op-header {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; padding: 14px 24px; border-bottom: 1px solid #e5e7eb;
}
.oh-left { display: flex; align-items: center; min-width: 0; }
.oh-titles { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; color: #fff;
  background: #1a6fff; border-radius: 6px; padding: 8px 14px; flex: none;
}
.oh-title { font-size: 16px; font-weight: 700; color: #111827; }
.oh-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.oh-no { font-size: 12px; color: #9ca3af; }
.copy { color: #9ca3af; font-size: 13px; cursor: pointer; }
.oh-channel { font-size: 12px; color: #9ca3af; }
.tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.tag-red { color: #ef4444; background: #ef44441f; }

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

.op-body { display: flex; gap: 16px; padding: 20px; flex: 1; align-items: flex-start; }
.op-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.op-side { width: 360px; flex: none; display: flex; flex-direction: column; gap: 16px; }

.dunning-band {
  display: flex; align-items: center; gap: 10px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px;
}
.db-icon { font-size: 14px; }
.db-text { flex: 1; font-size: 13px; font-weight: 500; color: #b91c1c; }
.db-link { font-size: 13px; font-weight: 600; color: #dc2626; cursor: pointer; flex: none; }

.detail-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.dc-title { font-size: 15px; font-weight: 700; color: #111827; }
.dc-meta-grid { display: flex; flex-wrap: wrap; gap: 18px; }
.dc-meta-item { display: flex; gap: 5px; font-size: 12px; }
.dc-meta-item .k { color: #9ca3af; }
.dc-meta-item .v { color: #374151; font-weight: 500; }
.dc-demand { background: #f9fafb; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.dc-label { font-size: 12px; font-weight: 600; color: #6b7280; }
.dc-demand-text { font-size: 13px; color: #374151; line-height: 1.6; }
.dc-attachments { display: flex; gap: 8px; flex-wrap: wrap; }
.dc-attach {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: #374151; background: #f3f4f6; border-radius: 6px; padding: 6px 10px;
}

.side-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.card-title-row { display: flex; align-items: center; justify-content: space-between; }
.card-title { font-size: 14px; font-weight: 700; color: #111827; }
.warranty { font-size: 10px; font-weight: 600; color: #059669; background: #ecfdf5; padding: 2px 8px; border-radius: 3px; }

.cust-top { display: flex; align-items: center; gap: 10px; }
.cust-av { width: 40px; height: 40px; border-radius: 20px; background: #1a6fff22; color: #1a6fff; font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.cust-name-row { display: flex; align-items: center; gap: 6px; }
.cust-name { font-size: 14px; font-weight: 600; color: #111827; }
.vip { font-size: 10px; font-weight: 600; color: #b45309; background: #fef3c7; padding: 1px 6px; border-radius: 3px; }
.cust-level { font-size: 12px; color: #9ca3af; }
.cust-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #374151; }
.call-mini {
  margin-left: auto; display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; color: #059669; background: #ecfdf5;
  border: 1px solid #a7f3d0; border-radius: 4px; padding: 3px 8px; cursor: pointer;
}
.cust-emotion { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ce-label { font-size: 12px; color: #6b7280; }
.ce-pill {
  font-size: 12px; color: #6b7280; background: #fff;
  border: 1px solid #d1d5db; border-radius: 12px; padding: 4px 12px;
}
.ce-pill.active { color: #6b7280; font-weight: 600; background: #6b72801f; border-color: #6b7280; }
.cust-history { display: flex; align-items: center; justify-content: space-between; background: #f9fafb; border-radius: 6px; padding: 8px 10px; font-size: 12px; color: #6b7280; }
.link { color: #1a6fff; cursor: pointer; font-weight: 500; }

.kv { display: flex; gap: 8px; font-size: 12px; }
.kv .k { color: #9ca3af; width: 48px; flex: none; }
.kv .v { color: #374151; font-weight: 500; }

.sub-section { display: flex; flex-direction: column; gap: 6px; }
.sub-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sub-title { font-size: 12px; font-weight: 600; color: #374151; }
.sub-action { font-size: 11px; font-weight: 600; color: #1a6fff; cursor: pointer; }
.sub-btns { display: flex; gap: 6px; }
.mini-btn {
  font-size: 10px; font-weight: 600; color: #374151; background: #fff;
  border: 1px solid #d1d5db; border-radius: 4px; padding: 3px 8px; cursor: pointer;
}
.section-divider { height: 1px; background: #e5e7eb; margin: 2px 0; }
.ticket-item { background: #f9fafb; border-radius: 6px; padding: 10px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.ticket-item:hover { background: #f3f4f6; }
.ticket-item-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ticket-no { font-size: 12px; color: #1a6fff; font-weight: 600; }
.ticket-tags { display: flex; gap: 4px; }
.mini-tag { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; }
.link-tag { color: #06b6d4; background: #06b6d41f; }
.ticket-item-bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ticket-item-title { font-size: 12px; color: #6b7280; }
.ticket-item-title.solo { margin-top: 0; }
.ticket-item-time { font-size: 10px; color: #9ca3af; }
.unlink { font-size: 10px; font-weight: 600; color: #9ca3af; cursor: pointer; }

.ai-card { background: #f5f3ff; border-color: #ddd6fe; }
.ai-title { font-size: 14px; font-weight: 700; color: #6d28d9; display: flex; align-items: center; gap: 6px; }
.ai-sub { font-size: 11px; font-weight: 600; color: #7c3aed; }
.similar-card { background: #fff; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.similar-top { display: flex; align-items: center; justify-content: space-between; }
.sim-tag { font-size: 10px; font-weight: 600; color: #10b981; background: #10b9811f; padding: 1px 6px; border-radius: 3px; }
.similar-title { font-size: 12px; color: #374151; }
.similar-solution { font-size: 11px; color: #9ca3af; line-height: 1.5; }
.similar-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.btn-ghost-purple { font-size: 11px; font-weight: 600; color: #7c3aed; background: #fff; border: 1px solid #7c3aed; border-radius: 4px; padding: 3px 10px; cursor: pointer; }
.btn-purple { font-size: 11px; font-weight: 600; color: #fff; background: #7c3aed; border: none; border-radius: 4px; padding: 3px 10px; cursor: pointer; }
.ai-block { background: #fff; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
.ai-text { font-size: 12px; color: #374151; line-height: 1.6; }
.ai-know { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff; border-radius: 6px; padding: 10px; }
.ai-know-text { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #374151; flex: 1; min-width: 0; }
.ai-adopt { font-size: 11px; color: #fff; background: #7c3aed; border-radius: 4px; padding: 3px 10px; cursor: pointer; flex: none; }

.side-spacer { flex: 1; min-height: 0; }

.add-card { border-radius: 12px; }
.add-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.add-title { font-size: 14px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 6px; }
.add-tabs { display: flex; gap: 2px; background: #f3f4f6; border-radius: 6px; padding: 2px; flex: none; }
.add-tab { font-size: 12px; color: #6b7280; padding: 4px 10px; border-radius: 5px; cursor: pointer; }
.add-tab.active { background: #fff; color: #1a6fff; font-weight: 600; border: 1px solid #e5e7eb; }
.add-textarea {
  height: 80px; resize: none; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 10px; font-size: 12px; color: #374151; outline: none; font-family: inherit; background: #f9fafb;
}
.add-textarea::placeholder { color: #9ca3af; }
.add-foot { display: flex; align-items: center; justify-content: space-between; }
.add-hint { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6b7280; cursor: pointer; }
.add-btn { font-size: 12px; font-weight: 600; color: #fff; background: #1a6fff; border: none; border-radius: 6px; padding: 6px 18px; cursor: pointer; }

.op-actionbar {
  position: sticky; bottom: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; padding: 12px 24px; border-top: 1px solid #e5e7eb;
}
.ab-right, .ab-left { display: flex; gap: 10px; }
.btn-outline { font-size: 13px; color: #374151; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; padding: 9px 16px; cursor: pointer; }
.btn-outline:hover { border-color: #1a6fff; color: #1a6fff; }
.btn-resolve { font-size: 13px; font-weight: 600; color: #fff; background: #10b981; border: none; border-radius: 6px; padding: 9px 16px; cursor: pointer; }
.btn-resolve:hover { background: #059669; }
</style>
