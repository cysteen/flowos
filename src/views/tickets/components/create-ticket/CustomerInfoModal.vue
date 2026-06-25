<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import type { CustomerInfo } from '@/views/tickets/types/createTicket';
import FormSelect from './FormSelect.vue';

type ContactType = '手机' | '固话' | '邮箱';

interface ContactDraft {
  type: ContactType;
  value: string;
}

const CONTACT_TYPE_OPTIONS: ContactType[] = ['手机', '固话', '邮箱'];
const CUSTOMER_TYPE_OPTIONS = ['个人客户', '企业客户', 'VIP客户', '渠道客户'];
const GENDER_OPTIONS = ['男', '女'];

/** 省 / 市 / 区 级联数据（原型示例数据集，value=label 便于与字符串互转） */
interface RegionNode {
  value: string;
  label: string;
  children?: RegionNode[];
}
function lv(items: string[]): RegionNode[] {
  return items.map((v) => ({ value: v, label: v }));
}
const REGION_OPTIONS: RegionNode[] = [
  {
    value: '北京市', label: '北京市',
    children: [{ value: '北京市', label: '北京市', children: lv(['朝阳区', '海淀区', '东城区', '西城区', '丰台区']) }],
  },
  {
    value: '上海市', label: '上海市',
    children: [{ value: '上海市', label: '上海市', children: lv(['浦东新区', '徐汇区', '黄浦区', '静安区', '闵行区']) }],
  },
  {
    value: '安徽省', label: '安徽省',
    children: [
      { value: '合肥市', label: '合肥市', children: lv(['蜀山区', '包河区', '庐阳区', '瑶海区', '高新区']) },
      { value: '芜湖市', label: '芜湖市', children: lv(['镜湖区', '弋江区', '鸠江区']) },
    ],
  },
  {
    value: '广东省', label: '广东省',
    children: [
      { value: '广州市', label: '广州市', children: lv(['天河区', '越秀区', '海珠区', '番禺区']) },
      { value: '深圳市', label: '深圳市', children: lv(['南山区', '福田区', '罗湖区', '宝安区']) },
    ],
  },
  {
    value: '浙江省', label: '浙江省',
    children: [
      { value: '杭州市', label: '杭州市', children: lv(['西湖区', '余杭区', '滨江区', '拱墅区']) },
      { value: '宁波市', label: '宁波市', children: lv(['海曙区', '江北区', '鄞州区']) },
    ],
  },
  {
    value: '江苏省', label: '江苏省',
    children: [
      { value: '南京市', label: '南京市', children: lv(['玄武区', '鼓楼区', '建邺区', '江宁区']) },
      { value: '苏州市', label: '苏州市', children: lv(['姑苏区', '工业园区', '吴中区']) },
    ],
  },
];

const REGION_SEP = ' / ';

const props = defineProps<{
  open: boolean;
  editing: boolean;
  initial?: CustomerInfo | null;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  save: [customer: CustomerInfo];
}>();

function defaultContact(): ContactDraft {
  return { type: '手机', value: '' };
}

function splitCustomerTypes(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
}

function contactsFromInitial(src: CustomerInfo | null | undefined): ContactDraft[] {
  if (src?.contacts?.length) {
    return src.contacts.map((c) => ({
      type: (c.type as ContactType) || '手机',
      value: c.value,
    }));
  }
  if (src?.phone?.trim()) {
    return [{ type: '手机', value: src.phone }];
  }
  return [defaultContact()];
}

const draft = reactive({
  name: '',
  customerTypes: [] as string[],
  gender: '男',
  contacts: [defaultContact()] as ContactDraft[],
  region: '',
  address: '',
  vip: false,
});

/** 省市区级联选中值（数组）；与 draft.region 字符串互转 */
const regionValue = ref<string[]>([]);
function regionToArray(s: string): string[] {
  return s ? s.split(REGION_SEP).map((x) => x.trim()).filter(Boolean) : [];
}
function onRegionChange(val: unknown) {
  draft.region = Array.isArray(val) ? (val as string[]).join(REGION_SEP) : '';
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    const src = props.editing && props.initial ? props.initial : null;
    draft.name = src?.name ?? '';
    draft.customerTypes = src?.customerTypes?.length
      ? [...src.customerTypes]
      : splitCustomerTypes(src?.customerType);
    draft.gender = src?.gender ?? '男';
    draft.contacts = contactsFromInitial(src);
    draft.region = src?.region ?? '';
    regionValue.value = regionToArray(draft.region);
    draft.address = src?.address ?? '';
    draft.vip = src?.vip ?? false;
  },
);

function addContact() {
  draft.contacts.push(defaultContact());
}

function removeContact(index: number) {
  if (draft.contacts.length <= 1) return;
  draft.contacts.splice(index, 1);
}

function primaryPhone(): string {
  const mobile = draft.contacts.find((c) => c.type === '手机' && c.value.trim());
  if (mobile) return mobile.value.trim();
  const first = draft.contacts.find((c) => c.value.trim());
  return first?.value.trim() ?? '';
}

function onCancel() {
  emit('update:open', false);
}

function onSave() {
  const phone = primaryPhone() || '未填写';
  const customerTypes = [...draft.customerTypes];
  emit('save', {
    id: props.initial?.id ?? 'c-' + Date.now(),
    name: draft.name.trim() || '新客户',
    phone,
    vip: draft.vip,
    customerType: customerTypes.join('、') || '个人客户',
    customerTypes,
    contacts: draft.contacts
      .filter((c) => c.value.trim())
      .map((c) => ({ type: c.type, value: c.value.trim() })),
    gender: draft.gender,
    region: draft.region.trim(),
    address: draft.address.trim(),
  });
}
</script>

<template>
  <a-modal
    :open="open"
    :title="editing ? '编辑客户' : '新建客户'"
    :width="560"
    centered
    ok-text="确定"
    cancel-text="取消"
    destroy-on-close
    class="customer-info-modal"
    @cancel="onCancel"
    @ok="onSave"
  >
    <div class="form">
      <!-- 行1：客户姓名 -->
      <div class="field">
        <label class="label"><span class="req">*</span>客户姓名</label>
        <a-input v-model:value="draft.name" placeholder="请输入客户姓名" />
      </div>

      <!-- 行2：客户类型 + 性别 -->
      <div class="row row-2">
        <div class="field">
          <label class="label">
            <span class="req">*</span>客户类型
            <span class="label-hint">（可多选）</span>
          </label>
          <a-select
            v-model:value="draft.customerTypes"
            mode="multiple"
            class="full"
            placeholder="点击下拉选择（可多选）"
            :options="CUSTOMER_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))"
            :max-tag-count="1"
            show-arrow
          />
        </div>
        <div class="field">
          <label class="label"><span class="req">*</span>客户性别</label>
          <FormSelect
            v-model:value="draft.gender"
            class="full"
            placeholder="点击下拉选择"
            :options="GENDER_OPTIONS.map((v) => ({ value: v, label: v }))"
          />
        </div>
      </div>

      <!-- 行3：联系方式 -->
      <div class="contact-section">
        <div
          v-for="(contact, index) in draft.contacts"
          :key="index"
          class="contact-row"
        >
          <div class="field contact-type">
            <label v-if="index === 0" class="label"><span class="req">*</span>联系方式</label>
            <FormSelect
              v-model:value="contact.type"
              class="full"
              :options="CONTACT_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="field phone-field">
            <label v-if="index === 0" class="label">
              <span class="req">*</span>手机号
              <span class="label-hint">可添加多个</span>
            </label>
            <div class="phone-input-row">
              <a-input
                v-model:value="contact.value"
                class="phone-input"
                :placeholder="contact.type === '邮箱' ? '请输入邮箱' : contact.type === '固话' ? '请输入固话号码' : '请输入手机号'"
              />
              <button
                v-if="index === draft.contacts.length - 1"
                type="button"
                class="add-btn"
                @click="addContact"
              >
                <PlusOutlined />
                添加
              </button>
              <button
                v-else
                type="button"
                class="remove-btn"
                @click="removeContact(index)"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 行4：省市区（级联选择） -->
      <div class="field">
        <label class="label"><span class="req">*</span>省市区</label>
        <a-cascader
          v-model:value="regionValue"
          class="full"
          :options="REGION_OPTIONS"
          placeholder="请选择省 / 市 / 区"
          expand-trigger="hover"
          @change="onRegionChange"
        />
      </div>

      <!-- 行5：详细地址 -->
      <div class="field">
        <label class="label">详细地址</label>
        <a-input v-model:value="draft.address" placeholder="请输入详细地址" />
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.row {
  display: grid;
  gap: 14px;
}

.row-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.row-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.label-hint {
  font-size: 10px;
  font-weight: 400;
  color: #9ca3af;
}

.req {
  color: #f56c6c;
}

.full,
.phone-input {
  width: 100%;
}

.contact-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.contact-row {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 10px;
  align-items: end;
}

.phone-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.phone-input {
  flex: 1;
  min-width: 0;
}

.add-btn,
.remove-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 4px;
  border: none;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.add-btn {
  color: #1a6fff;
}

.remove-btn {
  color: #9ca3af;
}

.add-btn:hover {
  color: #1557cc;
}

.remove-btn:hover {
  color: #ef4444;
}
</style>
