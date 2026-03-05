import QRCode from 'qrcode';

export async function generateQrSvg(url) {
  return QRCode.toString(url, { type: 'svg' });
}

export async function generateQrDataUri(url) {
  return QRCode.toDataURL(url);
}
