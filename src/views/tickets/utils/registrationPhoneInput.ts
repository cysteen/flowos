export interface RegistrationContactInputState {
  contactPhone: string;
  manuallyEdited: boolean;
}

export function applyRegistrationPhoneInput(
  state: RegistrationContactInputState,
  field: 'businessPhone' | 'contactPhone',
  value: string,
  isNew: boolean,
): RegistrationContactInputState {
  if (field === 'contactPhone') return { contactPhone: value, manuallyEdited: true };
  if (!isNew || state.manuallyEdited) return state;
  return { contactPhone: value.trim(), manuallyEdited: false };
}
