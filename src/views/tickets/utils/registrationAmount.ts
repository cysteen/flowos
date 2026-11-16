/** Currency stays as decimal text so formatting never rounds or loses precision. */
const AMOUNT_PATTERN = /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/;

export function registrationAmountError(value: string): string | undefined {
  const amount = value.trim();
  return amount && !AMOUNT_PATTERN.test(amount) ? '请输入非负金额，最多两位小数' : undefined;
}

/** Empty and invalid input are preserved; only valid amounts receive two decimals. */
export function formatRegistrationAmount(value: string): string {
  const amount = value.trim();
  if (!amount || registrationAmountError(amount)) return amount;
  const [integer = '', decimal = ''] = amount.split('.');
  return `${integer.replace(/^0+(?=\d)/, '') || '0'}.${decimal.padEnd(2, '0')}`;
}
