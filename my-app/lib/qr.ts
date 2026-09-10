import QRCode from 'qrcode';

// Every QR in the app is rendered large and read from a phone held at arm's
// length, so generate at high resolution (it only ever scales down) and keep the
// quiet zone the spec wants. Black on white, always: POPFLASH yellow behind a QR
// costs contrast, and a code that doesn't scan is a guest we lost.
export function makeQr(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}

// Where a phone should be sent for this session. Can't use window.location.origin
// on its own: on the booth machine that's localhost, which resolves to the phone
// itself and fails silently.
export function phoneUrlFor(token: string): string {
  const base = process.env.NEXT_PUBLIC_BOOTH_PUBLIC_URL || window.location.origin;
  return `${base}/s/${token}`;
}
