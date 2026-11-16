import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/views/tickets/utils/registrationPhoneInput.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const module = { exports: {} };
new Function('module', 'exports', outputText)(module, module.exports);
const { applyRegistrationPhoneInput } = module.exports;
const initial = () => ({ contactPhone: '', manuallyEdited: false });

test('typing a business phone character by character keeps the complete automatic contact phone', () => {
  const phone = '13900006666';
  let state = initial();
  for (let length = 1; length <= phone.length; length += 1) {
    const input = phone.slice(0, length);
    state = applyRegistrationPhoneInput(state, 'businessPhone', input, true);
    assert.equal(state.contactPhone, input);
    assert.equal(state.manuallyEdited, false);
  }
});

test('an automatic contact follows business-phone replacement, deletion and clearing', () => {
  let state = initial();
  for (const phone of ['13900006666', '13800005555', '1380000555', '', ' 13700004444 ']) {
    state = applyRegistrationPhoneInput(state, 'businessPhone', phone, true);
    assert.equal(state.contactPhone, phone.trim());
  }
});

test('manually maintaining a contact stops later business-phone changes from overwriting it', () => {
  let state = applyRegistrationPhoneInput(initial(), 'businessPhone', '13900006666', true);
  state = applyRegistrationPhoneInput(state, 'contactPhone', '13800005555', true);
  for (const phone of ['13700004444', '1', '']) {
    state = applyRegistrationPhoneInput(state, 'businessPhone', phone, true);
    assert.equal(state.contactPhone, '13800005555');
    assert.equal(state.manuallyEdited, true);
  }
});

test('an explicitly cleared contact remains blank instead of resuming automatic copying', () => {
  let state = applyRegistrationPhoneInput(initial(), 'businessPhone', '13900006666', true);
  state = applyRegistrationPhoneInput(state, 'contactPhone', '', true);
  state = applyRegistrationPhoneInput(state, 'businessPhone', '13800005555', true);
  assert.equal(state.contactPhone, '');
  assert.equal(state.manuallyEdited, true);
});

test('manual contact input is respected even when it equals the current automatic value', () => {
  let state = applyRegistrationPhoneInput(initial(), 'businessPhone', '13900006666', true);
  state = applyRegistrationPhoneInput(state, 'contactPhone', '13900006666', true);
  state = applyRegistrationPhoneInput(state, 'businessPhone', '13800005555', true);
  assert.equal(state.contactPhone, '13900006666');
});

test('drafts and existing records never acquire automatic contact updates', () => {
  for (const contactPhone of ['', '1', '13800005555']) {
    const state = { contactPhone, manuallyEdited: false };
    const result = applyRegistrationPhoneInput(state, 'businessPhone', '13900006666', false);
    assert.equal(result.contactPhone, contactPhone);
    assert.deepEqual(state, { contactPhone, manuallyEdited: false });
  }
});
