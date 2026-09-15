<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import type { BusinessType, CustomerContactType, CustomerInfo } from '@/views/tickets/types/createTicket';
import { SCHOOL_LIBRARY, type SchoolRecord } from '@/mock/schools';
import {
  REGION_SEP,
  findPhoneOwner,
  regionToArray,
} from '@/views/tickets/types/createTicket';
import FormSelect from './FormSelect.vue';

type ContactType = CustomerContactType;

interface ContactDraft {
  type: ContactType;
  value: string;
}

const CONTACT_TYPE_OPTIONS: ContactType[] = ['来电号码', '联系电话', '邮箱', '微信'];

function normalizeContactType(raw?: string): ContactType {
  if (raw === '固话') return '联系电话';
  if (raw === '手机') return '来电号码';
  if ((CONTACT_TYPE_OPTIONS as string[]).includes(raw ?? '')) return raw as ContactType;
  return '来电号码';
}

function contactPlaceholder(type: ContactType): string {
  if (type === '邮箱') return '请输入邮箱';
  if (type === '微信') return '请输入微信号';
  if (type === '联系电话') return '请输入联系电话';
  return '请输入来电号码';
}
const CUSTOMER_TYPE_OPTIONS = ['个人用户', '家长', '学生', '经销商', '终端客户', '内部员工', '老师'];

function normalizeCustomerType(raw?: string): string {
  if (raw === '个人客户') return '个人用户';
  if ((CUSTOMER_TYPE_OPTIONS as string[]).includes(raw ?? '')) return raw as string;
  return raw ?? '';
}
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

/** 教育 · 学校档案，选定学校后反查带出标签与归口人。与刷机单「学校名称」共用学校库（930 M42） */
const SCHOOL_CATALOG: SchoolRecord[] = SCHOOL_LIBRARY;

const props = defineProps<{
  open: boolean;
  editing: boolean;
  /** 当前工单业务分类，决定加载基线页 or 教育客户页 */
  businessType?: BusinessType | string;
  initial?: CustomerInfo | null;
  /** 新建时从搜索框带入的联系方式（搜索只按联系方式，故一定是一条联系方式） */
  prefillContact?: string;
}>();

const isEducationPage = computed(() => props.businessType === '教育');
const modalTitle = computed(() => {
  const base = props.editing ? '编辑客户' : '新建客户';
  return props.businessType ? `${base} · ${props.businessType}` : base;
});
/** 手机号与他人档案冲突时的阻断提示 */
const phoneConflict = ref('');

const emit = defineEmits<{
  'update:open': [v: boolean];
  save: [customer: CustomerInfo];
}>();

function defaultContact(): ContactDraft {
  return { type: '来电号码', value: '' };
}

function splitCustomerTypes(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
}

function contactsFromInitial(src: CustomerInfo | null | undefined): ContactDraft[] {
  if (src?.contacts?.length) {
    return src.contacts.map((c) => ({
      type: normalizeContactType(c.type),
      value: c.value,
    }));
  }
  if (src?.phone?.trim()) {
    return [{ type: '来电号码', value: src.phone }];
  }
  return [defaultContact()];
}

const draft = reactive({
  name: '',
  customerTypes: [] as string[],
  gender: '',
  contacts: [defaultContact()] as ContactDraft[],
  region: '',
  address: '',
  vip: false,
  school: '',
  schoolTag: '',
  serviceOwner: '',
});

const schoolLookupWarn = ref('');

/** 省市区级联选中值（数组）；与 draft.region 字符串互转 */
const regionValue = ref<string[]>([]);
function onRegionChange(val: unknown) {
  draft.region = Array.isArray(val) ? (val as string[]).join(REGION_SEP) : '';
}

/** 省市区搜索：任意一级命中即返回整条路径，忽略大小写与空格 */
function filterRegion(input: string, path: { label?: unknown }[]): boolean {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  return path.some((node) => String(node.label ?? '').toLowerCase().includes(q));
}

function lookupSchool(name: string) {
  const hit = SCHOOL_CATALOG.find((s) => s.name === name);
  if (hit) {
    draft.schoolTag = hit.tag;
    draft.serviceOwner = hit.owner;
    schoolLookupWarn.value = '';
    return;
  }
  draft.schoolTag = '';
  draft.serviceOwner = '';
  schoolLookupWarn.value = name.trim()
    ? '未匹配到学校信息，请核对学校名称'
    : '';
}

function onSchoolChange(val: unknown) {
  draft.school = typeof val === 'string' ? val : '';
  lookupSchool(draft.school);
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    const src = props.editing && props.initial ? props.initial : null;
    draft.name = src?.name ?? '';
    draft.customerTypes = (src?.customerTypes?.length
      ? [...src.customerTypes]
      : splitCustomerTypes(src?.customerType)
    ).map(normalizeCustomerType).filter(Boolean);
    // 性别选填：新建时不预设，不替坐席选
    draft.gender = src?.gender ?? '';
    draft.contacts = src
      ? contactsFromInitial(src)
      : props.prefillContact?.trim()
        ? [{ type: '来电号码', value: props.prefillContact.trim() }]
        : [defaultContact()];
    draft.region = src?.region ?? '';
    regionValue.value = regionToArray(draft.region);
    draft.address = src?.address ?? '';
    draft.vip = src?.vip ?? false;
    draft.school = src?.school ?? '';
    draft.schoolTag = src?.schoolTag ?? '';
    draft.serviceOwner = src?.serviceOwner ?? '';
    schoolLookupWarn.value = '';
    phoneConflict.value = '';
    if (draft.school) lookupSchool(draft.school);
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
  const mobile = draft.contacts.find(
    (c) => (c.type === '来电号码' || c.type === '联系电话') && c.value.trim(),
  );
  if (mobile) return mobile.value.trim();
  const first = draft.contacts.find((c) => c.value.trim());
  return first?.value.trim() ?? '';
}

function onCancel() {
  emit('update:open', false);
}

function onSave() {
  const phoneNow = primaryPhone();
  // 手机号是租户内客户唯一标识：与他人档案冲突时阻断保存，不静默覆盖。
  // **只有编辑态才排除自己**——新建时 initial 仍是工单上已绑定的那个客户，
  // 拿它当 self 会让"用已存在号码新建客户"绕过查重。
  const owner = findPhoneOwner(phoneNow, props.editing ? props.initial?.id : undefined);
  if (owner) {
    phoneConflict.value = `该手机号已关联客户「${owner.name}」，请确认是否同一人；如是，请返回搜索后直接绑定`;
    message.warning(phoneConflict.value);
    return Promise.reject(new Error('phone conflict'));
  }
  phoneConflict.value = '';

  // 联系方式是唯一必填项
  if (!phoneNow) {
    message.warning('请填写客户联系方式');
    return Promise.reject(new Error('contact required'));
  }

  // 学校是**选填**：不填照常保存；填了但反查不中，只提示不阻断，标签与归口人留空
  const phone = primaryPhone() || '未填写';
  const customerTypes = [...draft.customerTypes];
  emit('save', {
    id: props.initial?.id ?? 'c-' + Date.now(),
    // 姓名选填：没填就用主联系方式当客户卡上的标题，不编造占位名
    name: draft.name.trim() || phone,
    phone,
    vip: draft.vip,
    // 客户类型选填：没选就留空，不代填默认值
    customerType: customerTypes.join('、'),
    customerTypes,
    contacts: draft.contacts
      .filter((c) => c.value.trim())
      .map((c) => ({ type: c.type, value: c.value.trim() })),
    gender: draft.gender,
    region: draft.region.trim(),
    address: draft.address.trim(),
    ...(isEducationPage.value
      ? {
          school: draft.school.trim(),
          schoolTag: draft.schoolTag,
          serviceOwner: draft.serviceOwner,
        }
      : {}),
  });
}
</script>

<template>
  <a-modal
    :open="open"
    :title="modalTitle"
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
        <label class="label">客户姓名</label>
        <div class="ctl">
          <a-input v-model:value="draft.name" placeholder="请输入客户姓名" />
        </div>
      </div>

      <!-- 行2：客户类型 + 性别 -->
      <div class="row row-2">
        <div class="field">
          <label class="label">客户类型</label>
          <div class="ctl">
            <a-select
              v-model:value="draft.customerTypes"
              mode="multiple"
              placeholder="可多选"
              :options="CUSTOMER_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))"
              :max-tag-count="1"
              show-arrow
            />
          </div>
        </div>
        <div class="field">
          <label class="label">客户性别</label>
          <div class="ctl">
            <FormSelect
              :value="draft.gender || undefined"
              @update:value="(v: unknown) => (draft.gender = typeof v === 'string' ? v : '')"
              placeholder="请选择"
              :options="GENDER_OPTIONS.map((v) => ({ value: v, label: v }))"
            />
          </div>
        </div>
      </div>

      <!-- 行3：联系方式（可多条；只有首行出标签，其余行留白对齐） -->
      <div
        v-for="(contact, index) in draft.contacts"
        :key="index"
        class="field contact-field"
      >
        <label class="label">
          <template v-if="index === 0"><span class="req">*</span>联系方式</template>
        </label>
        <div class="contact-ctl">
          <FormSelect
            v-model:value="contact.type"
            class="contact-type"
            :options="CONTACT_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))"
          />
          <a-input
            v-model:value="contact.value"
            class="contact-value"
            :placeholder="contactPlaceholder(contact.type)"
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
          <button v-else type="button" class="remove-btn" @click="removeContact(index)">
            删除
          </button>
        </div>
      </div>

      <!-- 行4：省市区（级联选择） -->
      <div class="field">
        <label class="label">省市区</label>
        <div class="ctl">
          <!--
            省市区支持关键词搜索：三级点选一条路径要点三次，坐席边通话边录入太慢。
            输入任意一级的名字（省 / 市 / 区都行）即可直接命中整条路径。
          -->
          <a-cascader
            v-model:value="regionValue"
            :options="REGION_OPTIONS"
            placeholder="输入关键词搜索，或逐级选择"
            expand-trigger="hover"
            :show-search="{ filter: filterRegion, limit: 20 }"
            @change="onRegionChange"
          />
        </div>
      </div>

      <!-- 行5：详细地址 -->
      <div class="field">
        <label class="label">详细地址</label>
        <div class="ctl">
          <a-input v-model:value="draft.address" placeholder="请输入详细地址" />
        </div>
      </div>

      <!-- 教育客户页 · 行⑥⑦⑧（仅业务分类=教育）。不加分区标题：
           整页就是一列 key-value，为 3 行再起一个小节反而打断阅读；
           "哪些字段属于哪个分类"是规格约束，不需要在页面上向坐席解释。 -->
      <template v-if="isEducationPage">
        <div class="field">
          <label class="label">学校</label>
          <div class="ctl">
            <!-- 空值必须传 undefined：传 '' 会被当成"已选中一个空选项"，placeholder 不渲染 -->
            <a-select
              :value="draft.school || undefined"
              show-search
              allow-clear
              placeholder="请搜索并选择学校"
              :options="SCHOOL_CATALOG.map((s) => ({ value: s.name, label: s.name }))"
              @change="onSchoolChange"
            />
            <p v-if="schoolLookupWarn" class="field-warn">{{ schoolLookupWarn }}</p>
          </div>
        </div>

        <div class="row row-2">
          <div class="field">
            <label class="label">学校标签</label>
            <div class="ctl">
              <a-input :value="draft.schoolTag" placeholder="选定学校后自动带出" readonly />
            </div>
          </div>
          <div class="field">
            <label class="label">服务归口人</label>
            <div class="ctl">
              <a-input :value="draft.serviceOwner" placeholder="选定学校后自动带出" readonly />
            </div>
          </div>
        </div>
      </template>

      <p v-if="phoneConflict" class="field-error">{{ phoneConflict }}</p>
    </div>
  </a-modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.row {
  display: grid;
  gap: 12px;
}

.row-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

/* key 在左、value 在右 —— 与新建工单弹窗的 inline-field 同一套栅格 */
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.label {
  flex: none;
  width: 76px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  line-height: 32px;
  white-space: nowrap;
}

.ctl {
  flex: 1;
  min-width: 0;
}

.ctl :deep(.ant-input),
.ctl :deep(.ant-select),
.ctl :deep(.ant-cascader) {
  width: 100%;
}

.req {
  color: #f56c6c;
}

/*
  联系方式：类型固定宽、值自适应、动作按钮贴右。
  容器**不复用 .ctl**——.ctl 里的 `width:100%` 是 :deep 选择器，权重高于 .contact-type，
  复用会把类型下拉撑满整行、把号码输入框挤没。
*/
.contact-ctl {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.contact-ctl .contact-type {
  flex: none;
  width: 104px;
}

.contact-ctl .contact-value {
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


.field-warn {
  margin: 4px 0 0;
  font-size: 12px;
  color: #f59e0b;
}

.field-error {
  margin: 0;
  padding: 7px 10px;
  font-size: 12px;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
}
</style>
