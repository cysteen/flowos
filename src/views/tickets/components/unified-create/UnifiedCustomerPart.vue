<script setup lang="ts">
import { computed } from 'vue';
import { PlusOutlined, SearchOutlined, UserAddOutlined } from '@ant-design/icons-vue';
import { formatCustomerSubline, maskPhone } from '@/views/tickets/types/createTicket';
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

function toggleReporter() {
  form.showReporter = !form.showReporter;
}
</script>

<template>
  <div class="customer-layout">
    <CreateTicketPartCard title="客户信息" class="customer-part">
      <template #head-extra>
        <button type="button" class="btn-outline reporter-toggle" :aria-expanded="form.showReporter" @click="toggleReporter">
          <UserAddOutlined />
          {{ form.showReporter ? '移除代报人' : '新增代报人' }}
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

    <CreateTicketPartCard v-if="form.showReporter" title="代报人信息" class="reporter-part">
      <div class="reporter-fields">
        <div class="inline-field">
          <label for="uc-reporter-name" class="inline-label">姓名</label>
          <a-input id="uc-reporter-name" v-model:value="form.reporter.name" class="inline-control field-control" placeholder="代报人姓名" />
        </div>
        <div class="inline-field">
          <label for="uc-reporter-phone" class="inline-label">手机</label>
          <a-input id="uc-reporter-phone" v-model:value="form.reporter.phone" class="inline-control field-control" placeholder="代报人手机" />
        </div>
        <div class="inline-field">
          <label for="uc-reporter-relation" class="inline-label">与客户关系</label>
          <FormSelect
            id="uc-reporter-relation"
            v-model:value="form.reporter.relation"
            class="inline-control field-control"
            :options="['校园代理', '家属', '同事', '朋友', '其他'].map((v) => ({ value: v, label: v }))"
          />
        </div>
      </div>
    </CreateTicketPartCard>
  </div>
</template>
