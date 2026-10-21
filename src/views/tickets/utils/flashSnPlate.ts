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
