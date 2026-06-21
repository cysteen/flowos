<script setup lang="ts">
import { ref, reactive } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, EditOutlined, DeleteOutlined, GoldOutlined } from '@ant-design/icons-vue';

// 套餐管理（系统管理员）：能力包定义；"租户授权"在「租户管理」开通/编辑租户时选择套餐完成。
interface Plan {
  key: string; name: string; price: string; seats: string; orders: string;
  api: string; storage: string; tenants: number; color: string;
}
const plans = ref<Plan[]>([
  { key: 'basic', name: '基础版', price: '¥0', seats: '≤10 席', orders: '1,000/月', api: '1万/日', storage: '10 GB', tenants: 8, color: '#9ca3af' },
  { key: 'pro', name: '专业版', price: '¥1,980/月', seats: '≤50 席', orders: '2万/月', api: '10万/日', storage: '100 GB', tenants: 14, color: '#1a6fff' },
  { key: 'flagship', name: '旗舰版', price: '¥6,800/月', seats: '不限', orders: '不限', api: '100万/日', storage: '1 TB', tenants: 5, color: '#7c3aed' },
]);

const COLORS = ['#9ca3af', '#1a6fff', '#10b981', '#f59e0b', '#ef4444', '#7c3aed'];
const modalOpen = ref(false);
const editingKey = ref<string | null>(null);
const form = reactive({ name: '', price: '', seats: '', orders: '', api: '', storage: '', color: '#1a6fff' });

function openCreate() {
  editingKey.value = null;
  Object.assign(form, { name: '', price: '', seats: '', orders: '', api: '', storage: '', color: '#1a6fff' });
  modalOpen.value = true;
}
function openEdit(p: Plan) {
  editingKey.value = p.key;
  Object.assign(form, { name: p.name, price: p.price, seats: p.seats, orders: p.orders, api: p.api, storage: p.storage, color: p.color });
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
    <div class="page-head-row">
      <div class="page-head"><h2>套餐管理</h2><p>定义平台对外销售的能力包（席位 / 工单量 / API / 存储）；租户的套餐在「租户管理」开通或编辑时分配</p></div>
      <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建套餐</a-button>
    </div>

    <div class="plan-grid">
      <div v-for="p in plans" :key="p.key" class="plan-card" :style="{ borderTopColor: p.color }">
        <div class="pc-head">
          <span class="pc-ic" :style="{ background: p.color + '1A', color: p.color }"><GoldOutlined /></span>
          <span class="pc-name" :style="{ color: p.color }">{{ p.name }}</span>
        </div>
        <div class="pc-price">{{ p.price }}</div>
        <ul class="pc-feats">
          <li><label>坐席数</label>{{ p.seats }}</li>
          <li><label>工单量</label>{{ p.orders }}</li>
          <li><label>API</label>{{ p.api }}</li>
          <li><label>存储</label>{{ p.storage }}</li>
        </ul>
        <div class="pc-foot"><a-badge :count="p.tenants" :number-style="{ backgroundColor: p.color }" /> 个租户在用</div>
        <div class="pc-acts">
          <a-button size="small" block @click="openEdit(p)"><template #icon><EditOutlined /></template>编辑</a-button>
          <a-button size="small" danger :disabled="p.tenants > 0" @click="del(p)"><template #icon><DeleteOutlined /></template>删除</a-button>
        </div>
      </div>
    </div>

    <!-- 新建 / 编辑套餐 -->
    <a-modal v-model:open="modalOpen" :title="editingKey ? '编辑套餐' : '新建套餐'" :width="520" :ok-text="editingKey ? '保存' : '创建'" cancel-text="取消" @ok="save">
      <a-form layout="vertical">
        <div class="grid2">
          <a-form-item label="套餐名称" required><a-input v-model:value="form.name" placeholder="如：旗舰版" /></a-form-item>
          <a-form-item label="价格" required><a-input v-model:value="form.price" placeholder="如：¥6,800/月" /></a-form-item>
          <a-form-item label="坐席数"><a-input v-model:value="form.seats" placeholder="如：≤50 席 / 不限" /></a-form-item>
          <a-form-item label="工单量"><a-input v-model:value="form.orders" placeholder="如：2万/月" /></a-form-item>
          <a-form-item label="API 配额"><a-input v-model:value="form.api" placeholder="如：10万/日" /></a-form-item>
          <a-form-item label="存储"><a-input v-model:value="form.storage" placeholder="如：100 GB" /></a-form-item>
        </div>
        <a-form-item label="标识色">
          <div class="swatches">
            <span v-for="c in COLORS" :key="c" class="swatch" :class="{ on: form.color === c }" :style="{ background: c }" @click="form.color = c"></span>
          </div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.plat-plans { padding: 20px 24px; }
.page-head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; gap: 16px; }
.page-head h2 { font-size: 18px; font-weight: 700; color: #111827; }
.page-head p { font-size: 13px; color: #6b7280; margin-top: 2px; max-width: 720px; }
.plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 920px; }
.plan-card { background: #fff; border: 1px solid #e5e7eb; border-top: 3px solid; border-radius: 12px; padding: 18px; }
.pc-head { display: flex; align-items: center; gap: 10px; }
.pc-ic { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
.pc-name { font-size: 16px; font-weight: 700; }
.pc-price { font-size: 22px; font-weight: 700; color: #111827; margin: 12px 0 14px; }
.pc-feats { list-style: none; padding: 0; margin: 0 0 14px; }
.pc-feats li { display: flex; justify-content: space-between; font-size: 13px; color: #374151; padding: 7px 0; border-bottom: 1px dashed #f0f0f0; }
.pc-feats label { color: #9ca3af; }
.pc-foot { font-size: 12px; color: #6b7280; margin-bottom: 14px; }
.pc-acts { display: flex; gap: 8px; }
.pc-acts .ant-btn { flex: 1; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
:deep(.ant-form-item) { margin-bottom: 14px; }
.swatches { display: flex; gap: 10px; }
.swatch { width: 26px; height: 26px; border-radius: 7px; cursor: pointer; border: 2px solid transparent; }
.swatch.on { border-color: #111827; box-shadow: 0 0 0 2px #fff inset; }
</style>
