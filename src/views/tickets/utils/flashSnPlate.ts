/**
 * 设备SN照片：工单上存的是上传文件名，按 SN 绘制铭牌图作为缩略图与大图
 * （照片文件由刷机系统存储）。处理页「刷机信息」区块与两个修改刷机信息弹窗共用。
 */
export function snPlateDataUri(sn: string): string {
  const bars = Array.from({ length: 42 }, (_, k) => {
    const code = sn.charCodeAt(k % sn.length) + k;
    const w = (code % 3) + 1;
    return { x: 24 + k * 7.4, w };
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
<rect width="480" height="300" fill="#3f3f46"/>
<rect x="40" y="46" width="400" height="208" rx="10" fill="#f4f4f5"/>
<text x="64" y="92" font-family="Arial, sans-serif" font-size="20" fill="#27272a" font-weight="700">iFLYTEK</text>
<text x="64" y="124" font-family="Arial, sans-serif" font-size="15" fill="#52525b">S/N</text>
<text x="104" y="124" font-family="Consolas, monospace" font-size="20" fill="#18181b" font-weight="700">${sn}</text>
<g transform="translate(40,142)">${bars.map((b) => `<rect x="${b.x}" y="0" width="${b.w}" height="64" fill="#18181b"/>`).join('')}</g>
<text x="64" y="236" font-family="Arial, sans-serif" font-size="13" fill="#71717a">Made in China</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const xmlEscape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * MDM信息图片：工单上存的是上传文件名，按 SN 与学生账号绘制 MDM 设备详情截图作为缩略图与大图
 * （图片文件由刷机系统存储）。与设备SN照片同处展示。
 */
export function mdmInfoDataUri(sn: string, account: string): string {
  const rows: [string, string][] = [
    ['设备SN', sn],
    ['绑定账号', account || '—'],
    ['管控状态', '已管控'],
    ['刷机开关', '已开启'],
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
<rect width="480" height="300" fill="#f1f5f9"/>
<rect x="0" y="0" width="480" height="48" fill="#1e3a8a"/>
<text x="24" y="31" font-family="Arial, sans-serif" font-size="18" fill="#ffffff" font-weight="700">MDM · 设备详情</text>
<rect x="24" y="68" width="432" height="208" rx="8" fill="#ffffff" stroke="#e2e8f0"/>
${rows.map(([k, val], i) => `<text x="48" y="${110 + i * 44}" font-family="Arial, sans-serif" font-size="15" fill="#64748b">${k}</text>
<text x="160" y="${110 + i * 44}" font-family="Consolas, monospace" font-size="16" fill="#0f172a" font-weight="700">${xmlEscape(val)}</text>`).join('\n')}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 产品信息图片（小程序提报）：工单上存的是上传文件名，按产品名称与 SN 绘制设备背面铭牌照作为缩略图与大图。
 */
export function productInfoDataUri(productName: string, sn: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
<rect width="480" height="300" fill="#e7e5e4"/>
<rect x="96" y="20" width="288" height="260" rx="22" fill="#27272a"/>
<circle cx="140" cy="62" r="14" fill="#3f3f46" stroke="#52525b" stroke-width="3"/>
<text x="240" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#e4e4e7" font-weight="700">iFLYTEK</text>
<text x="240" y="208" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#d4d4d8">${xmlEscape(productName || '—')}</text>
<text x="240" y="232" text-anchor="middle" font-family="Consolas, monospace" font-size="12" fill="#a1a1aa">S/N ${xmlEscape(sn)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 学习证明附件（小程序提报 · 转校生）：工单上存的是上传文件名，按学生姓名与学校名称绘制转学证明作为缩略图与大图。
 */
export function studyProofDataUri(studentName: string, schoolName: string): string {
  const lines = [
    `兹证明 ${studentName || '—'} 同学`,
    `原就读于 ${schoolName || '—'}，`,
    '现已办理转学手续。',
    '特此证明。',
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
<rect width="480" height="300" fill="#d6d3d1"/>
<rect x="60" y="14" width="360" height="272" fill="#fffdf7" stroke="#e7e5e4"/>
<text x="240" y="62" text-anchor="middle" font-family="SimSun, serif" font-size="24" fill="#1c1917" font-weight="700">转 学 证 明</text>
${lines.map((t, i) => `<text x="92" y="${108 + i * 30}" font-family="SimSun, serif" font-size="14" fill="#292524">${xmlEscape(t)}</text>`).join('\n')}
<circle cx="340" cy="238" r="34" fill="none" stroke="#dc2626" stroke-width="3" opacity="0.8"/>
<text x="340" y="243" text-anchor="middle" font-family="SimSun, serif" font-size="12" fill="#dc2626" opacity="0.85">教务处</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
