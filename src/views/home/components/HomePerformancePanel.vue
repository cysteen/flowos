<script setup lang="ts">
import { RightOutlined, TrophyOutlined } from '@ant-design/icons-vue';
import type {
  HomeMetricDrillKey,
  HomePerformanceCard,
} from '@/mock/homeOverview';

defineProps<{ cards: HomePerformanceCard[] }>();

const emit = defineEmits<{
  drill: [key: HomeMetricDrillKey];
}>();
</script>

<template>
  <section class="performance-section">
    <div class="section-head">
      <div>
        <!--
          「效能」而非「绩效」：本区定位是自我管理 + 查漏补缺，不是考核。
          「绩效」在中文职场语境强关联 KPI 考核与薪酬，会让坐席读成被评价。
          需求模块3 原文注解即「当日效能数据」，且「效能」＝效率+效果，
          正好覆盖 效率/时效/质量/触达 四卡。
        -->
        <div class="section-title">我的效能</div>
        <div class="section-sub">今日实时口径 · 含组内位置</div>
      </div>
      <span class="rank-note">排名范围：受理一组 12 人</span>
    </div>

    <div class="performance-grid">
      <article
        v-for="card in cards"
        :key="card.key"
        class="performance-card"
        :class="{ drillable: !!card.drill }"
        @click="card.drill && emit('drill', card.drill)"
      >
        <header class="metric-head">
          <span class="metric-title">{{ card.title }}</span>
          <span class="rank-badge" :class="{ top: card.rank <= 3 }">
            <TrophyOutlined v-if="card.rank <= 3" />
            {{ card.rankLabel || '组内' }} 第 {{ card.rank }}
          </span>
        </header>

        <!-- 各卡恒为 3 个指标行，保证同区等长（见 mock HOME_PERFORMANCE 注释） -->
        <div class="metric-list">
          <div v-for="metric in card.metrics" :key="metric.label" class="metric-row">
            <span class="metric-label">{{ metric.label }}</span>
            <span class="metric-value" :class="metric.tone || 'neutral'">{{ metric.value }}</span>
          </div>
        </div>

        <!-- 排名只在右上角徽章出现一次；此处原有的「第 N / M 名」是重复信息，已删 -->
        <footer v-if="card.drill" class="metric-foot">
          <span class="drill-link">
            {{ card.drillLabel || '查看明细' }} <RightOutlined />
          </span>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped>
/**
 * 卡片视觉基线（2026-08-03 调整，与 HomeOverviewView 的 .card 同源）
 * 参考页实测：区块用「大卡套小卡」两层 —— 大卡圆角 21/padding 21，小卡圆角 12 + 浅阴影。
 * 本区照此改成大卡容器，让「我的绩效」7 张卡成组，而不是与其它区平铺。
 */
.performance-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.section-sub,
.rank-note {
  margin-top: 2px;
  font-size: 11px;
  color: #9ca3af;
}
.performance-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.performance-card {
  min-width: 0;
  min-height: 146px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.performance-card.drillable {
  cursor: pointer;
}
.performance-card.drillable:hover {
  border-color: #93c5fd;
  box-shadow: 0 4px 14px rgba(26, 111, 255, 0.1);
  transform: translateY(-1px);
}
.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.metric-title {
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: #374151;
}
.rank-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 4px;
}
.rank-badge.top {
  color: #b45309;
  background: #fffbeb;
}
.metric-list {
  flex: 1;
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
/* .dense 已移除：各卡恒为 3 行，不再需要按行数压缩间距 */
.metric-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.metric-label {
  min-width: 0;
  font-size: 11px;
  color: #6b7280;
}
.metric-value {
  flex: none;
  font-size: 14px;
  font-weight: 700;
  color: #374151;
}
.metric-value.primary { color: #1a6fff; }
.metric-value.success { color: #059669; }
.metric-value.warning { color: #d97706; }
.metric-value.danger { color: #dc2626; }
.metric-foot {
  margin-top: 10px;
  padding-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid #f3f4f6;
  font-size: 10px;
  color: #9ca3af;
}
.drill-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #1a6fff;
  font-weight: 600;
}

@media (max-width: 1400px) {
  .performance-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 1000px) {
  .performance-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 680px) {
  .performance-grid { grid-template-columns: 1fr; }
  .rank-note { display: none; }
}
</style>
