/**
 * Render the aurora + grid CSS background to a static PNG asset.
 * iOS PDF viewers render embedded raster images cleanly, while compound
 * CSS effects (radial-gradient + mask-image) rasterize poorly inside the
 * PDF. By baking the effect into a PNG we keep the visual impact AND
 * guarantee correct rendering across all viewers.
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const HTML = `<!DOCTYPE html><html><head><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{margin:0;padding:0}
  .page{
    width:840px;height:1188px;
    background:#0a0a0a;
    position:relative;overflow:hidden;
  }
  .aurora{
    position:absolute;inset:0;
    background:
      radial-gradient(60% 50% at 75% 20%, rgba(99, 102, 241, 0.22), transparent 60%),
      radial-gradient(45% 45% at 15% 85%, rgba(168, 85, 247, 0.18), transparent 60%),
      radial-gradient(55% 35% at 50% 50%, rgba(59, 130, 246, 0.08), transparent 70%);
  }
  .grid{
    position:absolute;inset:0;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 32px 32px;
    /* Mask radial so grid fades to edges — baked into PNG, not relied on at PDF time. */
    -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent 80%);
            mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent 80%);
  }
</style></head><body>
<div class="page"><div class="aurora"></div><div class="grid"></div></div>
</body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 840, height: 1188, deviceScaleFactor: 2 });
  await page.setContent(HTML, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 200));

  const out = path.resolve(__dirname, '..', 'presentation', 'assets', 'aurora-bg.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 840, height: 1188 } });

  console.log('Aurora →', out);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
