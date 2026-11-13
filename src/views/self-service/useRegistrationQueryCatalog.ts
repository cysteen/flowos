import { computed, type Ref } from 'vue';
import { useBusinessRegistrationStore } from '@/stores/businessRegistration';
import { useFormCatalogsStore } from '@/stores/formCatalogs';
import { REGISTRATION_TEMPLATES } from '@/views/tickets/types/businessRegistration';

export interface RegistrationQueryOption { value: string; label: string; parentValue?: string }
export interface RegistrationQuerySources {
  feedback: RegistrationQueryOption[];
  specificSource: RegistrationQueryOption[];
}

/** Queries retain disabled dictionary entries and values already stored on historical records. */
export function useRegistrationQueryCatalog(templateId: Ref<string>) {
  const catalogs = useFormCatalogsStore();
  const registrations = useBusinessRegistrationStore();
  const seed = computed(() => REGISTRATION_TEMPLATES.find((template) => template.id === templateId.value));
  const records = computed(() => registrations.records.filter((record) => record.templateId === templateId.value));
  const productCatalog = computed(() => {
    if (!seed.value) return undefined;
    const products = [
      ...catalogs.productRows(seed.value),
      ...records.value.map(({ values }) => ({ name: values.productName, category: values.productCategory })),
    ];
    return [...new Map(products.filter((product) => product.name || product.category)
      .map((product) => [`${product.category}\u0001${product.name}`, { name: product.name, category: product.category }])).values()];
  });
  const registrationSources = computed<RegistrationQuerySources | undefined>(() => {
    if (!seed.value) return undefined;
    const feedback = new Map(catalogs.optionRows(seed.value, 'feedback').map((option) => [option.value, { value: option.value, label: option.label }]));
    const specificSource = new Map(catalogs.optionRows(seed.value, 'specificSource').map((option) => [
      `${option.parentValue ?? ''}\u0001${option.value}`,
      { value: option.value, label: option.label, parentValue: option.parentValue },
    ]));
    records.value.forEach(({ values }) => {
      if (values.feedback && !feedback.has(values.feedback)) feedback.set(values.feedback, { value: values.feedback, label: values.feedback });
      const key = `${values.feedback}\u0001${values.specificSource}`;
      if (values.specificSource && !specificSource.has(key)) specificSource.set(key, { value: values.specificSource, label: values.specificSource, parentValue: values.feedback });
    });
    return { feedback: [...feedback.values()], specificSource: [...specificSource.values()] };
  });
  return { productCatalog, registrationSources };
}
