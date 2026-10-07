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
  form.fault = ctx.fault ?? '';
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
 * 售后建单页自身的必填校验（《【1025】》§2.2：必填项为空或全空格时售后建单页原样提示，客服侧不另出提示）。
 * 条件必填随服务方式：上门＝上门预约时间；寄修＝取件 / 回寄六项。
 */
type ReqKey = keyof typeof form | 'region';
const REQUIRED: { key: ReqKey; msg: string; when?: () => boolean }[] = [
  { key: 'customerName', msg: '请输入客户名称' },
  { key: 'customerPhone', msg: '请输入联系号码' },
  { key: 'region', msg: '请选择省市区' },
  { key: 'fault', msg: '请输入故障描述' },
  { key: 'productCategory', msg: '请选择产品分类' },
  { key: 'productName', msg: '请选择产品名称' },
  { key: 'serviceType', msg: '请选择售后服务类型' },
  { key: 'serviceMethod', msg: '请选择售后服务方式' },
  { key: 'visitTime', msg: '请输入上门预约时间', when: () => isVisit.value },
  { key: 'pickName', msg: '请输入寄件人姓名', when: () => isMail.value },
  { key: 'pickPhone', msg: '请输入寄件人号码', when: () => isMail.value },
  { key: 'pickAddress', msg: '请输入寄件人详细地址', when: () => isMail.value },
  { key: 'backName', msg: '请输入收货人姓名', when: () => isMail.value },
  { key: 'backPhone', msg: '请输入收货人号码', when: () => isMail.value },
  { key: 'backAddress', msg: '请输入收货人详细地址', when: () => isMail.value },
];
const errs = reactive<Partial<Record<ReqKey, string>>>({});
const blank = (key: ReqKey) => (key === 'region'
  ? [form.province, form.city, form.district].some((v) => !v?.trim())
  : !String(form[key] ?? '').trim());
const MAIL_LABEL = {
  pickName: '寄件人姓名', pickPhone: '寄件人号码', pickAddress: '寄件人详细地址',
  backName: '收货人姓名', backPhone: '收货人号码', backAddress: '收货人详细地址',
} as const;
function validate(): boolean {
  for (const k of Object.keys(errs) as ReqKey[]) delete errs[k];
  for (const r of REQUIRED) if ((!r.when || r.when()) && blank(r.key)) errs[r.key] = r.msg;
  return Object.keys(errs).length === 0;
}
// 补齐即撤掉该项提示
watch(form, () => {
  for (const k of Object.keys(errs) as ReqKey[]) if (!blank(k)) delete errs[k];
});

/**
 * 交出**整份表单**。此前只回传 serviceType / serviceMethod / detail 三项，
 * 客户、省市区、详细地址、故障描述、产品分类、SN 等 20 余个字段在提交那一刻全部丢弃 ——
 * 而转售后是在售后侧真建一张单，缺这些字段售后接到的是张空单（基线 §5.1「服务节点」）。
 *
 * 条件字段按服务方式取舍：上门方式不带取件 / 回寄，寄修方式不带上门预约，
 * 避免把上一次切换留下的残值一并送出。
 */
function getPayload(): AftersalePayload | null {
  if (!validate()) return null;
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
          <a-input v-model:value="form.customerName" placeholder="请输入名称" :status="errs.customerName ? 'error' : undefined" />
          <div v-if="errs.customerName" class="as-err">{{ errs.customerName }}</div>
        </div>
        <div class="as-field">
          <div class="as-label req">联系号码</div>
          <a-input v-model:value="form.customerPhone" placeholder="请输入联系号码" :status="errs.customerPhone ? 'error' : undefined" />
          <div v-if="errs.customerPhone" class="as-err">{{ errs.customerPhone }}</div>
        </div>
      </div>
      <div class="as-field">
        <div class="as-label req">省市区</div>
        <div class="as-region">
          <a-select v-model:value="form.province" :options="opt([form.province || '安徽省','北京市','上海市'])" placeholder="省" style="flex:1" :status="errs.region && !form.province ? 'error' : undefined" />
          <a-select v-model:value="form.city" :options="opt([form.city || '合肥市','—'])" placeholder="市" style="flex:1" :status="errs.region && !form.city ? 'error' : undefined" />
          <a-select v-model:value="form.district" :options="opt([form.district || '蜀山区','—'])" placeholder="区/县" style="flex:1" :status="errs.region && !form.district ? 'error' : undefined" />
        </div>
        <div v-if="errs.region" class="as-err">{{ errs.region }}</div>
      </div>
      <div class="as-field">
        <div class="as-label">详细地址</div>
        <a-input v-model:value="form.address" placeholder="请输入地址" />
      </div>
      <div class="as-field">
        <div class="as-label req">故障描述</div>
        <a-textarea v-model:value="form.fault" :rows="2" placeholder="请输入描述" :status="errs.fault ? 'error' : undefined" />
        <div v-if="errs.fault" class="as-err">{{ errs.fault }}</div>
      </div>
      <div class="as-field">
        <div class="as-label">故障图片 / 视频</div>
        <div class="as-upload"><PlusOutlined /><span>最多 9 个文件</span></div>
      </div>
    </div>

    <!-- 产品信息 -->
    <div class="as-section">
      <div class="as-sec-title">产品信息</div>
      <div class="as-grid">
        <div class="as-field">
          <div class="as-label req">产品分类</div>
          <a-input v-model:value="form.productCategory" placeholder="请选择产品分类" :status="errs.productCategory ? 'error' : undefined" />
          <div v-if="errs.productCategory" class="as-err">{{ errs.productCategory }}</div>
        </div>
        <div class="as-field">
          <div class="as-label req">产品名称</div>
          <a-input v-model:value="form.productName" placeholder="请选择产品名称" :status="errs.productName ? 'error' : undefined" />
          <div v-if="errs.productName" class="as-err">{{ errs.productName }}</div>
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
          <div class="as-label">设备 SN</div>
          <a-input v-model:value="form.sn" placeholder="请输入SN" />
        </div>
      </div>
    </div>

    <!-- 上门信息（服务方式=上门） -->
    <div v-if="isVisit" class="as-section">
      <div class="as-sec-title">上门信息</div>
      <div class="as-grid">
        <div class="as-field">
          <div class="as-label req">上门预约时间</div>
          <a-input v-model:value="form.visitTime" placeholder="年月日 时分" :status="errs.visitTime ? 'error' : undefined" />
          <div v-if="errs.visitTime" class="as-err">{{ errs.visitTime }}</div>
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
          <div v-for="k in (['pickName', 'pickPhone'] as const)" :key="k" class="as-field">
            <div class="as-label req">{{ MAIL_LABEL[k] }}</div>
            <a-input v-model:value="form[k]" :status="errs[k] ? 'error' : undefined" />
            <div v-if="errs[k]" class="as-err">{{ errs[k] }}</div>
          </div>
        </div>
        <div class="as-field">
          <div class="as-label req">{{ MAIL_LABEL.pickAddress }}</div>
          <a-input v-model:value="form.pickAddress" :status="errs.pickAddress ? 'error' : undefined" />
          <div v-if="errs.pickAddress" class="as-err">{{ errs.pickAddress }}</div>
        </div>
      </div>
      <div class="as-section">
        <div class="as-sec-title">回寄信息</div>
        <div class="as-grid">
          <div v-for="k in (['backName', 'backPhone'] as const)" :key="k" class="as-field">
            <div class="as-label req">{{ MAIL_LABEL[k] }}</div>
            <a-input v-model:value="form[k]" :status="errs[k] ? 'error' : undefined" />
            <div v-if="errs[k]" class="as-err">{{ errs[k] }}</div>
          </div>
        </div>
        <div class="as-field">
          <div class="as-label req">{{ MAIL_LABEL.backAddress }}</div>
          <a-input v-model:value="form.backAddress" :status="errs.backAddress ? 'error' : undefined" />
          <div v-if="errs.backAddress" class="as-err">{{ errs.backAddress }}</div>
        </div>
      </div>
    </template>

    <!-- 转出说明：只在「转售后」弹窗出现（§2.2） -->
    <div v-if="!context?.isComplaint" class="as-field as-field-stack">
      <div class="as-label">转出说明</div>
      <a-textarea v-model:value="form.detail" :rows="2" placeholder="请填写转出说明" />
    </div>
  </div>
</template>

<style scoped>
.as-form { display: flex; flex-direction: column; gap: 12px; }
.as-section { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: #f9fafb; border: 1px solid #eef0f2; border-radius: 8px; }
.as-sec-title { font-size: 13px; font-weight: 700; color: #1f2937; }
.as-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
/* key/value 左右布局，节省纵向空间 */
.as-field { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.as-err { flex-basis: 100%; padding-left: 98px; font-size: 12px; line-height: 1.5; color: #dc2626; }
.as-field-stack > .as-err { padding-left: 0; }
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
