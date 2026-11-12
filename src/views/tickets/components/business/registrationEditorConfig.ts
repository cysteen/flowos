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
  accessTime: 'datetime', orderTime: 'datetime', problemL1: 'select', problemL2: 'select',
  complaintType: 'select', closedLoop: 'select', description: 'textarea', processResult: 'textarea',
  refundAmount: 'amount',
};

/** Layout is independent of the template's business dictionary and validation rules. */
export function registrationEditorSections(template: RegistrationTemplate): RegistrationEditorSection[] {
  const field = (key: RegistrationFieldKey): RegistrationEditorField => {
    const definition = template.fields.find((item) => item.key === key);
    return {
      key, label: definition?.label ?? key, ...definition, control: controls[key] ?? 'text',
      full: key === 'description' || key === 'processResult',
      readonly: key === 'replyTime',
      help: key === 'businessPhone' ? '记录订购业务的号码，与联系号码分别使用' : undefined,
      placeholder: key === 'productName' ? '搜索产品名称' : key === 'processResult' ? '填写核实情况与处理结果' : undefined,
    };
  };
  return [
    { id: 'source', title: '问题与诉求', subtitle: '来源与时限', columns: 2,
      fields: ['feedback', 'specificSource', 'channelDetail', 'accessTime', 'timeLimit', 'upstreamNo'].map((key) => field(key as RegistrationFieldKey)) },
    { id: 'product', title: '产品与业务号码', subtitle: '选择产品可带出所属分类', columns: 3,
      fields: ['businessLine', 'productCategory', 'productName', 'businessPhone', 'operator', 'province', 'orderTime'].map((key) => field(key as RegistrationFieldKey)) },
    { id: 'process', title: '问题与处理结果', columns: 3,
      fields: ['problemL1', 'problemL2', 'requestType', 'complaintType', 'closedLoop', 'description', 'processResult'].map((key) => field(key as RegistrationFieldKey)) },
    { id: 'refund', title: '退费信息', subtitle: '按实际情况填写', columns: 3,
      fields: ['refundPhone', 'refundAmount', 'replyTime'].map((key) => field(key as RegistrationFieldKey)) },
  ];
}

export function registrationFieldOptions(field: RegistrationEditorField, template: RegistrationTemplate, values: RegistrationValues) {
  let choices: readonly string[] = field.options ?? [];
  if (field.key === 'specificSource') choices = template.sourceOptions[values.feedback] ?? [];
  if (field.key === 'productCategory') choices = field.options ?? [...new Set(template.products.map((item) => item.category))];
  if (field.key === 'productName') choices = template.products.map((item) => item.name);
  if (field.key === 'problemL1') choices = Object.keys(template.problemOptions);
  if (field.key === 'problemL2') choices = template.problemOptions[values.problemL1] ?? [];
  const parent = field.key === 'specificSource' ? values.feedback : field.key === 'problemL2' ? values.problemL1 : '';
  const result: { value: string; label: string; disabled?: boolean }[] = choices.map((value) => ({ value, label: registrationOptionLabel(template, field.key, value, parent) }));
  const current = values[field.key];
  if (current && !choices.includes(current)) result.push({ value: current, label: `${registrationOptionLabel(template, field.key, current, parent)}（历史值）`, disabled: true });
  return result;
}

export function registrationFieldVisible(field: RegistrationEditorField, template: RegistrationTemplate, values: RegistrationValues) {
  return field.key !== 'specificSource' || !!template.sourceOptions[values.feedback];
}
