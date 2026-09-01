/**
 * Genera el fondo DORADO (champagne-gold) del manual como PNG estático.
 * Mismo enfoque que gen-aurora-bg.cjs (bake a PNG para render robusto en PDF),
 * pero con glows dorados en vez de aurora indigo/violeta. Salida: assets/gold-bg.png
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const HTML = `<!DOCTYPE html><html><head><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{margin:0;padding:0}
  .page{ width:840px;height:1188px; background:#0a0a0a; position:relative;overflow:hidden; }
  .aurora{
    position:absolute;inset:0;
    background:
      radial-gradient(60% 50% at 78% 16%, rgba(212, 175, 55, 0.22), transparent 60%),
      radial-gradient(48% 46% at 12% 88%, rgba(184, 134, 11, 0.18), transparent 60%),
      radial-gradient(55% 35% at 50% 50%, rgba(242, 201, 76, 0.08), transparent 70%);
  }
  .grid{
    position:absolute;inset:0;
    background-image:
      linear-gradient(rgba(255,233,168,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,233,168,0.03) 1px, transparent 1px);
    background-size: 32px 32px;
    -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent 80%);
            mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent 80%);
  }
</style></head><body>
<div class="page"><div class="aurora"></div><div class="grid"></div></div>
</body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 840, height: 1188, deviceScaleFactor: 2 });
  await page.setContent(HTML, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 200));
  const out = path.resolve(__dirname, '..', 'presentation', 'assets', 'gold-bg.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 840, height: 1188 } });
  console.log('Gold bg →', out);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
