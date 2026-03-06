import { QRCodeStyling } from '@liquid-js/qr-code-styling';

const CONVOS_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 20" width="16" height="20"><circle cx="8" cy="8" fill="black" r="8"/><path d="M8.00003 16L10.3094 20H5.69063L8.00003 16Z" fill="black"/></svg>`;
const CONVOS_LOGO_DATA_URI =
  'data:image/svg+xml;base64,' + Buffer.from(CONVOS_LOGO_SVG).toString('base64');

function createStyledQR(url) {
  return new QRCodeStyling({
    width: 256,
    height: 256,
    data: url,
    type: 'svg',
    dotsOptions: { type: "dot", color: "#000000" },
    cornersSquareOptions: { type: "extra-rounded", color: "#000000" },
    cornersDotOptions: { type: "square", color: "#000000" },
    backgroundOptions: { color: "#ffffff" },
    image: CONVOS_LOGO_DATA_URI,
    imageOptions: { margin: 5, imageSize: 0.3, hideBackgroundDots: true },
    qrOptions: { errorCorrectionLevel: "H" },
  });
}

export async function generateQrSvg(url) {
  const qr = createStyledQR(url);
  return qr.serialize();
}

export async function generateQrDataUri(url) {
  const qr = createStyledQR(url);
  const buffer = await qr.toBuffer('png');
  return 'data:image/png;base64,' + buffer.toString('base64');
}
