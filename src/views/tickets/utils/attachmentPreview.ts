function previewContentType(contentType: string): string {
  const mediaType = contentType.split(';', 1)[0]!.trim().toLowerCase();
  if (!/^[\x20-\x7e]+$/.test(contentType)) return 'application/octet-stream';
  if (/^(?:text\/(?:plain|csv|markdown)|application\/(?:pdf|json|octet-stream))$/.test(mediaType)
    || /^(?:image|audio|video)\//.test(mediaType) && mediaType !== 'image/svg+xml') return contentType;
  // Active documents must not gain the application's origin through a blob URL.
  if (mediaType.startsWith('text/') || /(?:html|xml|javascript|ecmascript)/.test(mediaType)) return 'text/plain;charset=utf-8';
  return 'application/octet-stream';
}

function percentDecodedBytes(payload: string): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(payload);
  let written = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x25) {
      bytes[written++] = bytes[index]!;
      continue;
    }
    const hex = String.fromCharCode(bytes[index + 1] ?? 0, bytes[index + 2] ?? 0);
    if (!/^[\da-f]{2}$/i.test(hex)) throw new Error('附件内容编码无效');
    bytes[written++] = Number.parseInt(hex, 16);
    index += 2;
  }
  return bytes.subarray(0, written);
}

/** Synchronous so opening the preview retains the user's click gesture. */
export function dataUrlToPreviewBlob(url: string): Blob {
  const comma = url.indexOf(',');
  if (!/^data:/i.test(url) || comma < 0) throw new Error('附件内容地址无效');
  const [mediaType, ...parameters] = url.slice(5, comma).split(';');
  const base64 = parameters.some((part) => part.trim().toLowerCase() === 'base64');
  const contentType = [mediaType || 'text/plain', ...parameters.filter((part) => part.trim().toLowerCase() !== 'base64')].join(';');
  const payload = url.slice(comma + 1);
  let bytes: Uint8Array<ArrayBuffer>;
  if (base64) {
    const binary = atob(decodeURIComponent(payload));
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } else bytes = percentDecodedBytes(payload);
  return new Blob([bytes], { type: previewContentType(contentType) });
}
