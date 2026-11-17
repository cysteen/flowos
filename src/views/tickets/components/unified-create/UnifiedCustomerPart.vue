<script setup lang="ts">
import { computed, watch } from 'vue';
import { DeleteOutlined, PlusOutlined, SearchOutlined, UserAddOutlined } from '@ant-design/icons-vue';
import { formatCustomerSubline, maskPhone } from '@/views/tickets/types/createTicket';
import type { ReporterInfo } from '@/views/tickets/types/createTicket';
import type { useCreateTicketForm } from '@/views/tickets/composables/useCreateTicketForm';
import CreateTicketPartCard from '../create-ticket/CreateTicketPartCard.vue';
import CustomerInfoModal from '../create-ticket/CustomerInfoModal.vue';
import FormSelect from '../create-ticket/FormSelect.vue';

const props = defineProps<{
  ctx: ReturnType<typeof useCreateTicketForm>;
  /** 售后：客户详情只在内嵌售后表单里出现，这里只留搜索与两个按钮 */
  searchOnly?: boolean;
}>();

// eslint-disable-next-line vue/no-setup-props-destructure -- ctx 随表单实例创建，生命周期内不换
const {
  form,
  errors,
  customerModalOpen,
  editingCustomer,
  customerSearchOpen,
  customerSearchHits,
  customerSearchTooMany,
  isFlashType,
  flashPhoneError,
  searchCustomer,
  onCustomerQueryInput,
  closeCustomerSearch,
  selectCustomer,
  clearCustomer,
  openCreateCustomer,
  openEditCustomer,
  saveCustomer,
} = props.ctx;

/** 搜索框里的原始输入即一条联系方式；选中客户后改写成「姓名 · 号码」，不再预填 */
const newCustomerPrefill = computed(() => {
  const q = form.customerQuery.trim();
  return q && !q.includes(' · ') ? q : '';
});

function emptyReporter(): ReporterInfo {
  return { name: '', phone: '', relation: '家属' };
}

/** 旧草稿只有 `reporter` 单对象，打开统一建单时迁入多代报人列表。 */
watch(
  () => form.showReporter,
  (visible) => {
    if (visible && !form.reporters.length) form.reporters.push({ ...form.reporter });
  },
  { immediate: true },
);

/** 首条同步回旧字段，保证旧的提交/草稿读取逻辑仍能拿到同一名代报人。 */
watch(
  () => form.reporters,
  (rows) => { Object.assign(form.reporter, rows[0] ?? emptyReporter()); },
  { deep: true },
);

function addReporter() {
  if (!form.showReporter || !form.reporters.length) {
    form.showReporter = true;
    if (!form.reporters.length) form.reporters.push({ ...form.reporter });
    return;
  }
  form.reporters.push(emptyReporter());
}

function removeReporter(index: number) {
  form.reporters.splice(index, 1);
  if (!form.reporters.length) {
    form.showReporter = false;
    Object.assign(form.reporter, emptyReporter());
  }
}
</script>

<template>
  <div class="customer-layout">
    <CreateTicketPartCard title="客户信息" class="customer-part">
      <template #head-extra>
        <button type="button" class="btn-outline reporter-toggle" :aria-expanded="form.showReporter" @click="addReporter">
          <UserAddOutlined />
          {{ form.showReporter ? '继续添加代报人' : '新增代报人' }}
        </button>
      </template>
      <div class="customer-body">
        <div class="customer-toolbar">
          <div class="search-wrap">
            <div class="search-box" @keyup.enter="searchCustomer">
              <SearchOutlined :style="{ color: '#9CA3AF', fontSize: '15px' }" />
              <input
                v-model="form.customerQuery"
                class="search-input"
                placeholder="请输入客户联系方式进行搜索"
                @input="onCustomerQueryInput"
              />
            </div>
            <div v-if="customerSearchOpen" class="search-drop">
              <button
                v-for="c in customerSearchHits"
                :key="c.id"
                type="button"
                class="drop-item"
                @click="selectCustomer(c)"
              >
                <span class="drop-name">{{ c.name }}</span>
                <span v-if="c.vip" class="vip-tag sm">VIP</span>
                <span class="drop-phone">{{ maskPhone(c.phone) }}</span>
                <span class="drop-meta">{{ [c.customerType, c.region].filter(Boolean).join(' · ') }}</span>
              </button>
              <div v-if="!customerSearchHits.length" class="drop-empty">
                未找到匹配客户
                <span class="drop-link" @click="openCreateCustomer">+ 新建客户</span>
              </div>
              <div v-else-if="customerSearchTooMany" class="drop-tip">
                结果过多，请输入完整联系方式
              </div>
              <div class="drop-close" @click="closeCustomerSearch">收起</div>
            </div>
          </div>
          <button type="button" class="btn-outline" @click="openCreateCustomer">
            <PlusOutlined />
            新建客户
          </button>
        </div>

        <div v-if="form.customer && !searchOnly" class="customer-card">
          <div class="cust-avatar">{{ form.customer.name.slice(0, 1) }}</div>
          <div class="cust-info">
            <div class="cust-line1">
              <span class="cust-name">{{ form.customer.name }}</span>
              <span v-if="form.customer.vip" class="vip-tag">VIP</span>
              <span class="cust-phone">{{ form.customer.phone }}</span>
            </div>
            <div class="cust-line2">
              {{ formatCustomerSubline(form.customer, form.businessType) }}
            </div>
          </div>
          <div class="cust-actions">
            <span class="link" @click="openEditCustomer">编辑</span>
            <span class="link" @click="clearCustomer">更换</span>
          </div>
        </div>
        <div v-if="form.customer && isFlashType && flashPhoneError" class="cust-phone-error">
          {{ flashPhoneError }}
        </div>
        <div v-if="!form.customer && !searchOnly" class="customer-empty" :class="{ error: errors.customer }">
          {{ errors.customer ? '请先选择客户，未绑定客户不可提交工单' : '未绑定客户 · 客户为建单必填项' }}
        </div>
      </div>

      <CustomerInfoModal
        :key="form.businessType"
        v-model:open="customerModalOpen"
        :editing="editingCustomer"
        :business-type="form.businessType"
        :initial="form.customer"
        :prefill-contact="newCustomerPrefill"
        @save="saveCustomer"
      />
    </CreateTicketPartCard>

    <CreateTicketPartCard v-if="form.showReporter" :title="`代报人信息（${form.reporters.length}）`" class="reporter-part">
      <div class="reporter-fields">
        <div v-for="(reporter, index) in form.reporters" :key="index" class="reporter-item">
          <span class="reporter-index" :aria-label="`第 ${index + 1} 位代报人`">{{ index + 1 }}</span>
          <div class="inline-field reporter-name-field">
            <label :for="`uc-reporter-name-${index}`" class="inline-label">姓名</label>
            <a-input :id="`uc-reporter-name-${index}`" v-model:value="reporter.name" class="inline-control field-control" placeholder="代报人姓名" />
          </div>
          <div class="inline-field reporter-phone-field">
            <label :for="`uc-reporter-phone-${index}`" class="inline-label">手机号</label>
            <a-input :id="`uc-reporter-phone-${index}`" v-model:value="reporter.phone" class="inline-control field-control" placeholder="代报人手机号" />
          </div>
          <div class="inline-field reporter-relation-field">
            <label :for="`uc-reporter-relation-${index}`" class="inline-label">与客户关系</label>
            <FormSelect
              :id="`uc-reporter-relation-${index}`"
              v-model:value="reporter.relation"
              class="inline-control field-control"
              :options="['校园代理', '家属', '同事', '朋友', '其他'].map((v) => ({ value: v, label: v }))"
            />
          </div>
          <button type="button" class="reporter-remove" :title="`删除代报人 ${index + 1}`" :aria-label="`删除代报人 ${index + 1}`" @click="removeReporter(index)">
            <DeleteOutlined />
          </button>
        </div>
      </div>
    </CreateTicketPartCard>
  </div>
</template>
