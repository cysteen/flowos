import type {
  RegistrationFieldDefinition, RegistrationFieldKey, RegistrationTemplate, RegistrationValues,
} from '@/views/tickets/types/businessRegistration';
import { registrationOptionLabel } from '@/views/tickets/types/businessRegistration';

export type RegistrationControl = 'text' | 'select' | 'datetime' | 'textarea' | 'amount';
export interface RegistrationEditorField extends RegistrationFieldDefinition {
  control: RegistrationControl;
  full?: boolean;
  readonly?: boolean;
  placeholder?: string;
  help?: string;
}
export interface RegistrationEditorSection {
  id: string;
  title: string;
  subtitle?: string;
  columns: number;
  fields: RegistrationEditorField[];
}

const controls: Partial<Record<RegistrationFieldKey, RegistrationControl>> = {
  feedback: 'select', specificSource: 'select', timeLimit: 'select', businessLine: 'select',
  productCategory: 'select', productName: 'select', operator: 'select', province: 'select',
  accessTime: 'datetime', replyTime: 'datetime', orderTime: 'datetime', problemL1: 'select', problemL2: 'select',
  complaintType: 'select', closedLoop: 'select', description: 'textarea', processResult: 'textarea',
  refundAmount: 'amount',
};

/** Layout is independent of the template's business dictionary and validation rules. */
export function registrationEditorSections(template: RegistrationTemplate): RegistrationEditorSection[] {
  const field = (key: RegistrationFieldKey): RegistrationEditorField => {
    const definition = template.fields.find((item) => item.key === key);
    return {
      key, label: definition?.label ?? key, ...definition, control: controls[key] ?? 'text',
      full: key === 'description' || key === 'processResult' || key === 'requestType',
      placeholder:
        key === 'productName' ? '请选择'
        : key === 'processResult' ? '核实情况与处理结果'
        : definition?.placeholder,
    };
  };
  return [
    { id: 'source', title: '来源与时限', columns: 3,
      fields: ['feedback', 'specificSource', 'upstreamNo', 'timeLimit', 'accessTime', 'replyTime', 'requestType'].map((key) => field(key as RegistrationFieldKey)) },
    { id: 'product', title: '产品与业务', columns: 3,
      fields: ['businessLine', 'productCategory', 'productName', 'businessPhone', 'operator', 'province', 'channelDetail', 'orderTime'].map((key) => field(key as RegistrationFieldKey)) },
    { id: 'process', title: '问题与处理', columns: 3,
      fields: ['complaintType', 'problemL1', 'problemL2', 'refundPhone', 'refundAmount', 'closedLoop', 'description', 'processResult'].map((key) => field(key as RegistrationFieldKey)) },
  ];
}

export function registrationFieldOptions(field: RegistrationEditorField, template: RegistrationTemplate, values: RegistrationValues) {
  let choices: readonly string[] = field.options ?? [];
  if (field.key === 'specificSource') choices = template.sourceOptions[values.feedback] ?? [];
  if (field.key === 'productCategory') choices = template.productCategoryOptions?.[values.businessLine] ?? [...new Set(template.products.filter((item) => item.businessLine === values.businessLine).map((item) => item.category))];
  if (field.key === 'productName') choices = template.products.filter((item) => item.businessLine === values.businessLine && item.category === values.productCategory).map((item) => item.name);
  if (field.key === 'problemL1') choices = Object.keys(template.problemOptions);
  if (field.key === 'problemL2') choices = template.problemOptions[values.problemL1] ?? [];
  const parent = field.key === 'specificSource' ? values.feedback : field.key === 'problemL2' ? values.problemL1 : field.key === 'productCategory' ? values.businessLine : '';
  const result: { value: string; label: string; disabled?: boolean }[] = choices.map((value) => ({ value, label: registrationOptionLabel(template, field.key, value, parent) }));
  const current = values[field.key];
  if (current && !choices.includes(current)) result.push({ value: current, label: `${registrationOptionLabel(template, field.key, current, parent)}（历史值）`, disabled: true });
  return result;
}

export function registrationFieldVisible(field: RegistrationEditorField, template: RegistrationTemplate, values: RegistrationValues) {
  if (field.key !== 'specificSource') return true;
  return !!values.specificSource || (template.sourceOptions[values.feedback]?.length ?? 0) > 0;
}

export function registrationFieldParent(field: RegistrationFieldKey): RegistrationFieldKey | undefined {
  return field === 'productCategory' ? 'businessLine' : field === 'productName' ? 'productCategory' : field === 'specificSource' ? 'feedback' : field === 'problemL2' ? 'problemL1' : undefined;
}

export function registrationFieldDisabled(field: RegistrationFieldKey, values: RegistrationValues): boolean {
  const parent = registrationFieldParent(field);
  return !!parent && !values[parent];
}

export function registrationFieldPlaceholder(field: RegistrationEditorField, values: RegistrationValues): string {
  const parent = registrationFieldParent(field.key);
  const parentLabels: Partial<Record<RegistrationFieldKey, string>> = { businessLine: '业务线', productCategory: '产品分类', feedback: '反馈平台', problemL1: '问题分类一' };
  return parent && !values[parent] ? `请先选择${parentLabels[parent] ?? '上级'}` : field.placeholder || '请选择';
}
