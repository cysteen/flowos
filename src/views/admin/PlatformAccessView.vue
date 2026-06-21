<script setup lang="ts">
import { ref, reactive } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined,
  TeamOutlined,
  FileTextOutlined,
  PhoneOutlined,
  CloudOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { CrownOutlined } from '@ant-design/icons-vue';
import { PLAN_OPTIONS, getPlanBrand } from '@/mock/platformAdmin';

// 套餐管理（系统管理员）：能力包定义；"租户授权"在「租户管理」开通/编辑租户时选择套餐完成。
interface Plan {
  key: string; name: string; price: string; seats: string; orders: string;
  outbound: string; storage: string; tenants: number; color: string;
}
const PLAN_META: Record<string, { key: string; price: string; tenants: number }> = {
  基础版: { key: 'basic', price: '¥0', tenants: 8 },
  专业版: { key: 'pro', price: '¥1,980/月', tenants: 14 },
  旗舰版: { key: 'flagship', price: '¥6,800/月', tenants: 5 },
};
function planFromOption(p: (typeof PLAN_OPTIONS)[number]): Plan {
  const meta = PLAN_META[p.value];
  return {
    key: meta.key,
    name: p.value,
    price: meta.price,
    seats: p.seats,
    orders: p.orders,
    outbound: p.outbound,
    storage: p.storage,
    tenants: meta.tenants,
    color: getPlanBrand(p.value).color,
  };
}
const plans = ref<Plan[]>(PLAN_OPTIONS.map(planFromOption));

const COLORS = ['#9ca3af', '#1a6fff', '#d48806', '#10b981', '#f59e0b', '#ef4444'];
const modalOpen = ref(false);
const editingKey = ref<string | null>(null);
const form = reactive({ name: '', price: '', seats: '', orders: '', outbound: '', storage: '', color: '#1a6fff' });

function openCreate() {
  editingKey.value = null;
  Object.assign(form, { name: '', price: '', seats: '', orders: '', outbound: '', storage: '', color: '#1a6fff' });
  modalOpen.value = true;
}
function openEdit(p: Plan) {
  editingKey.value = p.key;
  Object.assign(form, { name: p.name, price: p.price, seats: p.seats, orders: p.orders, outbound: p.outbound, storage: p.storage, color: p.color });
  modalOpen.value = true;
}
function save() {
  if (!form.name || !form.price) { message.error('请填写套餐名称与价格'); return; }
  if (editingKey.value) {
    const p = plans.value.find((x) => x.key === editingKey.value);
    if (p) Object.assign(p, { ...form });
    message.success('套餐已更新');
  } else {
    plans.value.push({ key: 'plan_' + (plans.value.length + 1), tenants: 0, ...form });
    message.success('套餐已创建');
  }
  modalOpen.value = false;
}
function del(p: Plan) {
  if (p.tenants > 0) { message.warning(`「${p.name}」仍有 ${p.tenants} 个租户在用，不可删除`); return; }
  Modal.confirm({
    title: '确认删除', icon: null, content: `删除套餐「${p.name}」？`,
    okText: '确认删除', okType: 'danger', cancelText: '取消',
    onOk: () => { plans.value = plans.value.filter((x) => x.key !== p.key); message.success('套餐已删除'); },
  });
}
</script>

<template>
  <div class="plat-plans">
    <div class="plans-panel">
      <AdminPageHeader
        title="套餐管理"
        subtitle="定义平台对外销售的能力包（席位 / 工单量 / 外呼 / 存储）；租户的套餐在「租户管理」开通或编辑时分配"
      >
        <template #actions>
          <a-button type="primary" @click="openCreate">
            <template #icon><PlusOutlined /></template>
            新建套餐
          </a-button>
        </template>
      </AdminPageHeader>

      <div class="plan-grid">
        <article v-for="p in plans" :key="p.key" class="plan-card">
          <span class="plan-accent" :style="{ background: p.color }" aria-hidden="true" />

          <header class="plan-head">
            <div class="plan-title-row">
              <h3 class="plan-name">{{ p.name }}</h3>
              <span v-if="p.key === 'pro'" class="plan-badge pro">常用</span>
              <span v-else-if="getPlanBrand(p.name).crown" class="plan-badge flagship"><CrownOutlined /> 旗舰</span>
            </div>
            <div class="plan-price">{{ p.price }}</div>
          </header>

          <ul class="plan-feats">
            <li>
              <TeamOutlined class="feat-ic" />
              <span class="feat-label">坐席数</span>
              <span class="feat-val">{{ p.seats }}</span>
            </li>
            <li>
              <FileTextOutlined class="feat-ic" />
              <span class="feat-label">工单量</span>
              <span class="feat-val">{{ p.orders }}</span>
            </li>
            <li>
              <PhoneOutlined class="feat-ic" />
              <span class="feat-label">外呼</span>
              <span class="feat-val">{{ p.outbound }}</span>
            </li>
            <li>
              <CloudOutlined class="feat-ic" />
              <span class="feat-label">存储</span>
              <span class="feat-val">{{ p.storage }}</span>
            </li>
          </ul>

          <footer class="plan-foot">
            <span class="tenant-pill">
              <strong :style="{ color: p.color }">{{ p.tenants }}</strong>
              个租户在用
            </span>
            <div class="plan-acts">
              <a-button type="link" size="small" @click="openEdit(p)">编辑</a-button>
              <a-button type="link" size="small" danger :disabled="p.tenants > 0" @click="del(p)">删除</a-button>
            </div>
          </footer>
        </article>
      </div>
    </div>

    <a-modal
      v-model:open="modalOpen"
      :title="editingKey ? '编辑套餐' : '新建套餐'"
      :width="520"
      :ok-text="editingKey ? '保存' : '创建'"
      cancel-text="取消"
      @ok="save"
    >
      <a-form layout="vertical">
        <div class="grid2">
          <a-form-item label="套餐名称" required><a-input v-model:value="form.name" placeholder="如：旗舰版" /></a-form-item>
          <a-form-item label="价格" required><a-input v-model:value="form.price" placeholder="如：¥6,800/月" /></a-form-item>
          <a-form-item label="坐席数"><a-input v-model:value="form.seats" placeholder="如：≤50 席 / 不限" /></a-form-item>
          <a-form-item label="工单量"><a-input v-model:value="form.orders" placeholder="如：2万/月" /></a-form-item>
          <a-form-item label="外呼次数"><a-input v-model:value="form.outbound" placeholder="如：3,000/日" /></a-form-item>
          <a-form-item label="存储"><a-input v-model:value="form.storage" placeholder="如：100 GB" /></a-form-item>
        </div>
        <a-form-item label="标识色">
          <div class="swatches">
            <button
              v-for="c in COLORS"
              :key="c"
              type="button"
              class="swatch"
              :class="{ on: form.color === c }"
              :style="{ background: c }"
              :aria-label="`选择颜色 ${c}`"
              @click="form.color = c"
            />
          </div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.plat-plans {
  min-height: 100%;
  padding: 16px 20px 20px;
  background: var(--flowos-content-bg, #f9fafb);
}

.plans-panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 20px 24px 24px;
}

.plans-panel :deep(.admin-page-header) {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f1f3;
}

.plan-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.plan-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  padding: 18px 18px 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.plan-card:hover {
  border-color: #e0e4ea;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.plan-accent {
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  border-radius: 8px 0 0 8px;
}

.plan-head {
  padding-left: 6px;
  margin-bottom: 16px;
}

.plan-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.plan-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
}

.plan-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
}

.plan-badge.pro {
  background: #eff6ff;
  color: #1a6fff;
}

.plan-badge.flagship {
  background: #fffbeb;
  color: #d48806;
}

.plan-price {
  font-size: 20px;
  font-weight: 600;
  color: #111827;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.plan-feats {
  list-style: none;
  margin: 0;
  padding: 0 0 0 6px;
  flex: 1;
}

.plan-feats li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid #f5f6f8;
  font-size: 13px;
}

.plan-feats li:last-child {
  border-bottom: none;
}

.feat-ic {
  flex: none;
  font-size: 13px;
  color: #9ca3af;
}

.feat-label {
  flex: 1;
  color: #9ca3af;
}

.feat-val {
  color: #374151;
  font-weight: 500;
}

.plan-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding: 12px 6px 0;
  border-top: 1px solid #f0f1f3;
}

.tenant-pill {
  font-size: 12px;
  color: #9ca3af;
}

.tenant-pill strong {
  font-weight: 600;
  margin-right: 2px;
}

.plan-acts {
  display: flex;
  align-items: center;
  gap: 2px;
}

.plan-acts :deep(.ant-btn-link) {
  padding: 0 6px;
  height: 24px;
  font-size: 13px;
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

:deep(.ant-form-item) {
  margin-bottom: 14px;
}

.swatches {
  display: flex;
  gap: 10px;
}

.swatch {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  padding: 0;
}

.swatch.on {
  border-color: #111827;
  box-shadow: 0 0 0 2px #fff inset;
}

@media (max-width: 1100px) {
  .plan-grid {
    grid-template-columns: 1fr;
    max-width: 420px;
  }
}
</style>
