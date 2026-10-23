// QR dependency-free (vendored qrcode-generator, MIT). Genera un SVG string
// crisp y colorable para la entrada del evento. Lazy-importado solo donde se usa.
import qrcode from './vendor/qrcode-generator';

export function qrSvg(text, { fg = '#0a0806', bg = '#ffffff', margin = 4, ecl = 'M' } = {}) {
  const qr = qrcode(0, ecl); // 0 = auto-size
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const size = n + margin * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Código QR de la entrada"><rect width="${size}" height="${size}" fill="${bg}"/><path d="${path}" fill="${fg}"/></svg>`;
}
