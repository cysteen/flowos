/**
 * 将 iFLY-FlowOS-坐席视角.pen 中 PageTabs 样式改为 Chrome 胶囊 Tab
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PEN = join(__dir, '../../iFLY-FlowOS-坐席视角.pen');

const CHROME = {
  barFill: '#EEF1F6',
  activeFill: '#D3E3FD',
  activeText: '#202124',
  inactiveText: '#5F6368',
  closeIcon: '#5F636899',
};

function patchTabBar(node) {
  if (node.name !== 'PageTabs') return;
  node.fill = CHROME.barFill;
  node.gap = 6;
  node.padding = [0, 8];
  node.alignItems = 'center';
  if (node.strokeWidth) delete node.stroke;
  delete node.strokeWidth;
}

function patchTab(node) {
  if (node.name !== 'PageTab-active' && node.name !== 'PageTab-inactive') return;
  const active = node.name === 'PageTab-active';
  node.height = 32;
  node.cornerRadius = 8;
  node.gap = 8;
  node.padding = [0, 10, 0, 12];
  delete node.effect;
  delete node.stroke;
  if (active) {
    node.fill = CHROME.activeFill;
  } else {
    delete node.fill;
  }
  if (!node.children) return;
  for (const child of node.children) {
    if (child.name === 'TabText' || child.name === 'TabTextWrap') {
      if (child.type === 'text') {
        child.fill = active ? CHROME.activeText : CHROME.inactiveText;
        child.fontWeight = active ? '500' : '400';
        child.textAlign = 'left';
        delete child.letterSpacing;
      } else if (child.children) {
        for (const t of child.children) {
          if (t.name === 'TabText' && t.type === 'text') {
            t.fill = active ? CHROME.activeText : CHROME.inactiveText;
            t.fontWeight = active ? '500' : '400';
            t.textAlign = 'left';
            delete t.letterSpacing;
          }
        }
      }
    }
    if (child.name === 'CloseIcon' && child.type === 'text') {
      child.fill = CHROME.closeIcon;
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
    '● 样式：Chrome 胶囊 Tab · 宽 160 · 未选透明底 #5F6368 · 选中 #D3E3FD 底 #202124 字 · 圆角 8px · 右侧 ×',
  );
  node.content = node.content.replace(/bg #F4F6FA/g, 'bg #EEF1F6');
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
console.log('Chrome tab style patched:', PEN);
