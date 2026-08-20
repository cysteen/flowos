<script setup lang="ts">
// 售后建单页复刻（转售后弹窗内嵌）：参照售后系统「新增工单」页——客户信息 + 产品信息，
// + 上门/取件/回寄按服务方式条件显隐。字段从客服工单预填（D9），服务类型/方式由坐席选。
import { reactive, computed, watch } from 'vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import { AFTERSALE_SERVICE_TYPES, AFTERSALE_SERVICE_METHODS } from '../../composables/opActions';
import type { AftersaleContext, AftersalePayload } from '../../composables/opActions';

const props = defineProps<{ context?: AftersaleContext }>();

/** 拆解 "安徽省 / 合肥市 / 蜀山区" → [省,市,区] */
function splitRegion(region?: string): [string, string, string] {
  const parts = (region ?? '').split('/').map((s) => s.trim());
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''];
}

const form = reactive({
  customerName: '', customerPhone: '',
  province: '', city: '', district: '',
  address: '', fault: '',
  productCategory: '', productName: '',
  serviceType: AFTERSALE_SERVICE_TYPES[0], serviceMethod: AFTERSALE_SERVICE_METHODS[0],
  brand: '', productAttr: '', sn: '',
  // 上门
  visitTime: '', visitNote: '',
  // 取件（寄修）
  pickName: '', pickPhone: '', pickAddress: '',
  // 回寄（寄修）
  backName: '', backPhone: '', backAddress: '',
  detail: '',
});

function prefill(ctx?: AftersaleContext) {
  if (!ctx) return;
  const [p, c, d] = splitRegion(ctx.region);
  form.customerName = ctx.customerName ?? '';
  form.customerPhone = ctx.customerPhone ?? '';
  form.province = p; form.city = c; form.district = d;
  form.address = ctx.address ?? '';
  form.productCategory = ctx.productCategory ?? '';
  form.productName = ctx.productName ?? '';
  form.sn = ctx.sn ?? '';
  // 取件/回寄默认使用客户信息
  form.pickName = form.backName = ctx.customerName ?? '';
  form.pickPhone = form.backPhone = ctx.customerPhone ?? '';
  form.pickAddress = form.backAddress = ctx.address ?? '';
}
prefill(props.context);
watch(() => props.context, prefill);

const isVisit = computed(() => form.serviceMethod === '上门');
const isMail = computed(() => form.serviceMethod === '寄修');

const opt = (arr: readonly string[]) => arr.map((v) => ({ value: v, label: v }));

/**
 * 交出**整份表单**。此前只回传 serviceType / serviceMethod / detail 三项，
 * 客户、省市区、详细地址、故障描述、产品分类、SN 等 20 余个字段在提交那一刻全部丢弃 ——
 * 而转售后是在售后侧真建一张单，缺这些字段售后接到的是张空单（基线 §5.1「服务节点」）。
 *
 * 条件字段按服务方式取舍：上门方式不带取件 / 回寄，寄修方式不带上门预约，
 * 避免把上一次切换留下的残值一并送出。
 */
function getPayload(): AftersalePayload {
  const base = {
    customerName: form.customerName,
    customerPhone: form.customerPhone,
    province: form.province,
    city: form.city,
    district: form.district,
    address: form.address,
    fault: form.fault,
    productCategory: form.productCategory,
    productName: form.productName,
    serviceType: form.serviceType,
    serviceMethod: form.serviceMethod,
    brand: form.brand,
    productAttr: form.productAttr,
    sn: form.sn,
    detail: form.detail,
  };
  if (isVisit.value) {
    return { ...base, visitTime: form.visitTime, visitNote: form.visitNote };
  }
  if (isMail.value) {
    return {
      ...base,
      pickName: form.pickName,
      pickPhone: form.pickPhone,
      pickAddress: form.pickAddress,
      backName: form.backName,
      backPhone: form.backPhone,
      backAddress: form.backAddress,
    };
  }
  return base;
}

defineExpose({ getPayload });
</script>

<template>
  <div class="as-form">
    <!-- 客户信息 -->
    <div class="as-section">
      <div class="as-sec-title">客户信息</div>
      <div class="as-grid">
        <div class="as-field">
          <div class="as-label req">客户名称</div>
          <a-input v-model:value="form.customerName" placeholder="请输入名称" />
        </div>
        <div class="as-field">
          <div class="as-label req">联系号码</div>
          <a-input v-model:value="form.customerPhone" placeholder="请输入联系号码" />
        </div>
      </div>
      <div class="as-field">
        <div class="as-label req">省市区</div>
        <div class="as-region">
          <a-select v-model:value="form.province" :options="opt([form.province || '安徽省','北京市','上海市'])" placeholder="省" style="flex:1" />
          <a-select v-model:value="form.city" :options="opt([form.city || '合肥市','—'])" placeholder="市" style="flex:1" />
          <a-select v-model:value="form.district" :options="opt([form.district || '蜀山区','—'])" placeholder="区/县" style="flex:1" />
        </div>
      </div>
      <div class="as-field">
        <div class="as-label req">详细地址</div>
        <a-input v-model:value="form.address" placeholder="请输入地址（带不出可留空补填）" />
      </div>
      <div class="as-field">
        <div class="as-label req">故障描述</div>
        <a-textarea v-model:value="form.fault" :rows="2" placeholder="请输入描述" />
      </div>
      <div class="as-field">
        <div class="as-label">故障图片/视频</div>
        <div class="as-upload"><PlusOutlined /><span>最多 9 个文件</span></div>
      </div>
    </div>

    <!-- 产品信息 -->
    <div class="as-section">
      <div class="as-sec-title">产品信息</div>
      <div class="as-grid">
        <div class="as-field">
          <div class="as-label req">产品分类</div>
          <a-input v-model:value="form.productCategory" placeholder="请选择产品分类" />
        </div>
        <div class="as-field">
          <div class="as-label req">产品名称</div>
          <a-input v-model:value="form.productName" placeholder="请选择产品名称" />
        </div>
        <div class="as-field">
          <div class="as-label req">售后服务类型</div>
          <a-select v-model:value="form.serviceType" :options="opt(AFTERSALE_SERVICE_TYPES)" style="width:100%" />
        </div>
        <div class="as-field">
          <div class="as-label req">售后服务方式</div>
          <a-select v-model:value="form.serviceMethod" :options="opt(AFTERSALE_SERVICE_METHODS)" style="width:100%" />
        </div>
        <div class="as-field">
          <div class="as-label">品牌</div>
          <a-input v-model:value="form.brand" placeholder="按产品自动带出" disabled />
        </div>
        <div class="as-field">
          <div class="as-label">产品属性</div>
          <a-input v-model:value="form.productAttr" placeholder="按产品自动带出" disabled />
        </div>
        <div class="as-field">
          <div class="as-label">设备SN</div>
          <a-input v-model:value="form.sn" placeholder="请输入SN（带不出可留空）" />
        </div>
      </div>
    </div>

    <!-- 上门信息（服务方式=上门） -->
    <div v-if="isVisit" class="as-section">
      <div class="as-sec-title">上门信息</div>
      <div class="as-grid">
        <div class="as-field">
          <div class="as-label req">上门预约时间</div>
          <a-input v-model:value="form.visitTime" placeholder="年月日 时分" />
        </div>
        <div class="as-field">
          <div class="as-label">预约备注</div>
          <a-input v-model:value="form.visitNote" placeholder="请输入备注" />
        </div>
      </div>
    </div>

    <!-- 取件 / 回寄信息（服务方式=寄修） -->
    <template v-if="isMail">
      <div class="as-section">
        <div class="as-sec-title">取件信息</div>
        <div class="as-grid">
          <div class="as-field"><div class="as-label req">寄件人姓名</div><a-input v-model:value="form.pickName" /></div>
          <div class="as-field"><div class="as-label req">寄件人号码</div><a-input v-model:value="form.pickPhone" /></div>
        </div>
        <div class="as-field"><div class="as-label req">寄件人详细地址</div><a-input v-model:value="form.pickAddress" /></div>
      </div>
      <div class="as-section">
        <div class="as-sec-title">回寄信息</div>
        <div class="as-grid">
          <div class="as-field"><div class="as-label req">收货人姓名</div><a-input v-model:value="form.backName" /></div>
          <div class="as-field"><div class="as-label req">收货人号码</div><a-input v-model:value="form.backPhone" /></div>
        </div>
        <div class="as-field"><div class="as-label req">收货人详细地址</div><a-input v-model:value="form.backAddress" /></div>
      </div>
    </template>

    <div class="as-field as-field-stack">
      <div class="as-label">转出说明</div>
      <a-textarea v-model:value="form.detail" :rows="2" placeholder="请填写转售后说明..." />
    </div>
  </div>
</template>

<style scoped>
.as-form { display: flex; flex-direction: column; gap: 12px; }
.as-section { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: #f9fafb; border: 1px solid #eef0f2; border-radius: 8px; }
.as-sec-title { font-size: 13px; font-weight: 700; color: #1f2937; }
.as-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
/* key/value 左右布局，节省纵向空间 */
.as-field { display: flex; flex-direction: row; align-items: center; gap: 8px; }
.as-label { flex: none; width: 90px; text-align: right; white-space: nowrap; font-size: 12px; color: #6b7280; }
.as-label.req::before { content: '*'; color: #ef4444; margin-right: 2px; }
.as-field > .ant-input,
.as-field > .ant-select,
.as-field > .as-region,
.as-field > .as-upload { flex: 1; min-width: 0; }
.as-field-stack {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.as-field-stack > .as-label {
  width: auto;
  text-align: left;
}
.as-field-stack > .ant-input,
.as-field-stack > textarea.ant-input {
  width: 100%;
}
.as-region { display: flex; gap: 6px; }
.as-upload {
  display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px;
  border: 1px dashed #d1d5db; border-radius: 6px; color: #9ca3af; font-size: 12px;
}
</style>
