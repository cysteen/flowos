/**
 * 将 iFLY-FlowOS-坐席视角.pen 中 PageTabs 改为 Chrome 经典 Tab
 * 激活：白底衔接内容区；未激活：透明 + 分隔
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PEN = join(__dir, '../../iFLY-FlowOS-坐席视角.pen');

const CHROME = {
  barFill: '#E1E8F2',
  activeFill: '#FFFFFF',
  activeText: '#374151',
  inactiveText: '#6B7280',
  closeIcon: '#6B728099',
};

function patchTabBar(node) {
  if (node.name !== 'PageTabs') return;
  node.fill = CHROME.barFill;
  node.gap = 0;
  node.padding = [0, 8];
  node.alignItems = 'end';
  if (node.strokeWidth) delete node.stroke;
  delete node.strokeWidth;
}

function patchTab(node) {
  if (node.name !== 'PageTab-active' && node.name !== 'PageTab-inactive') return;
  const active = node.name === 'PageTab-active';
  node.height = active ? 36 : 34;
  node.cornerRadius = active ? [8, 8, 0, 0] : 0;
  node.gap = 8;
  node.padding = [0, 10, 0, 12];
  delete node.effect;
  delete node.stroke;
  if (active) {
    node.fill = CHROME.activeFill;
    node.stroke = '#1A6FFF';
    node.strokeWidth = { top: 2 };
  } else {
    delete node.fill;
  }
  if (!node.children) return;
  for (const child of node.children) {
    if (child.name === 'TabText' || child.name === 'TabTextWrap') {
      if (child.type === 'text') {
        child.fill = active ? CHROME.activeText : CHROME.inactiveText;
        child.fontWeight = active ? '600' : '400';
        child.textAlign = 'left';
        delete child.letterSpacing;
      } else if (child.children) {
        for (const t of child.children) {
          if (t.name === 'TabText' && t.type === 'text') {
            t.fill = active ? CHROME.activeText : CHROME.inactiveText;
            t.fontWeight = active ? '600' : '400';
            t.textAlign = 'left';
            delete t.letterSpacing;
          }
        }
      }
    }
    if (child.name === 'CloseIcon' && child.type === 'text') {
      child.fill = CHROME.closeIcon;
      child.fontSize = 14;
    }
  }
}

function walk(node) {
  if (!node || typeof node !== 'object') return;
  patchTabBar(node);
  patchTab(node);
  if (Array.isArray(node.children)) node.children.forEach(walk);
  if (node.descendants && typeof node.descendants === 'object') {
    Object.values(node.descendants).forEach(walk);
  }
  if (Array.isArray(node)) node.forEach(walk);
}

function patchSpecNotes(node) {
  if (node.type !== 'note' || !node.content?.includes('PageTabs')) return;
  node.content = node.content.replace(
    /● 样式：[^\n]+/,
    '● 样式：Chrome 经典 Tab · 宽 160 · 未选透明 #5F6368 + 竖分隔线 · 选中 #F9FAFB 白底顶圆角衔接内容区 · 右侧 ×',
  );
  node.content = node.content.replace(/bg #[A-F0-9]{6}/gi, 'bg #EDF1F7');
}

function walkNotes(node) {
  if (!node || typeof node !== 'object') return;
  patchSpecNotes(node);
  if (Array.isArray(node.children)) node.children.forEach(walkNotes);
  if (node.descendants && typeof node.descendants === 'object') {
    Object.values(node.descendants).forEach(walkNotes);
  }
  if (Array.isArray(node)) node.forEach(walkNotes);
}

const doc = JSON.parse(readFileSync(PEN, 'utf8'));
walk(doc);
walkNotes(doc);
writeFileSync(PEN, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
console.log('Chrome classic tab style patched:', PEN);
