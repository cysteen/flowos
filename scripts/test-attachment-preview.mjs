import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/views/tickets/utils/attachmentPreview.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const module = { exports: {} };
new Function('module', 'exports', outputText)(module, module.exports);
const { dataUrlToPreviewBlob } = module.exports;

test('FileReader base64 text retains Chinese and newline content', async () => {
  const text = '附件预览验证\n真实上传内容';
  const blob = dataUrlToPreviewBlob(`data:text/plain;charset=utf-8;base64,${Buffer.from(text).toString('base64')}`);
  assert.equal(blob.type, 'text/plain;charset=utf-8');
  assert.equal(await blob.text(), text);
});

test('binary attachment preview retains exact bytes, including null and high bytes', async () => {
  const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
  const blob = dataUrlToPreviewBlob(`data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`);
  assert.equal(blob.type, 'application/pdf');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test('percent encoding preserves UTF-8, binary bytes, comma and literal plus', async () => {
  assert.equal(await dataUrlToPreviewBlob('data:text/plain,%E4%B8%AD%E6%96%87,a+b').text(), '中文,a+b');
  const binary = dataUrlToPreviewBlob('data:application/octet-stream,%00%FF%2C');
  assert.deepEqual(new Uint8Array(await binary.arrayBuffer()), Uint8Array.from([0, 255, 44]));
});

test('default media type, empty files and case-insensitive base64 are supported', async () => {
  assert.equal(await dataUrlToPreviewBlob('data:,hello').text(), 'hello');
  assert.equal(dataUrlToPreviewBlob('data:text/plain;base64,').size, 0);
  assert.equal(await dataUrlToPreviewBlob('DATA:text/plain;BASE64,YQ==').text(), 'a');
});

test('active local documents are previewed as text without acquiring an executable blob document', async () => {
  for (const mime of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/javascript']) {
    const blob = dataUrlToPreviewBlob(`data:${mime};base64,${Buffer.from('<script>test</script>').toString('base64')}`);
    assert.equal(blob.type, 'text/plain;charset=utf-8');
    assert.equal(await blob.text(), '<script>test</script>');
  }
});

test('non-data URLs and malformed payloads fail instead of opening invalid content', () => {
  for (const value of ['https://files.example.test/test.txt', 'data:text/plain', 'data:text/plain;base64,%%%', 'data:text/plain,%Q1']) {
    assert.throws(() => dataUrlToPreviewBlob(value));
  }
});
