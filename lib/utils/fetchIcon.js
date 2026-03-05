import { APP_ICON_MAX_BYTES, APP_ICON_ALLOWED_TYPES } from '../constants.js';

export async function fetchIcon(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new Error(`Failed to fetch icon: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`Icon fetch returned HTTP ${res.status}`);
  }

  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim();
  if (!contentType || !APP_ICON_ALLOWED_TYPES.has(contentType)) {
    throw new Error(`Unsupported icon content type: ${contentType}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > APP_ICON_MAX_BYTES) {
    throw new Error(`Icon too large: ${arrayBuffer.byteLength} bytes (max ${APP_ICON_MAX_BYTES})`);
  }

  return { contentType, data: Buffer.from(arrayBuffer) };
}
