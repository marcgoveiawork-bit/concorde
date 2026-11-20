// usage: node shot.js <rootDir> <page.html> '<json [[file, jsExpr], ...]>' [w h]
// Serves files from rootDir to the page via request interception (no server).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
(async () => {
  const [root, page, viewsJson, w = 1200, h = 900] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage(process.env.PHONE ? { viewport: { width: +w, height: +h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: +w, height: +h } });
  p.on('console', m => console.log('console:', m.text()));
  p.on('pageerror', e => console.log('ERR', e.message));
  p.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  await p.route('http://local.test/**', async route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = path.join(path.resolve(root), rel);
    if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
  });
  const NM = path.join(__dirname, 'node_modules');
  await p.route('https://cdn.jsdelivr.net/npm/**', route => {
    const m = new URL(route.request().url()).pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.*)$/);
    const file = m && path.join(NM, m[1], m[2]);
    if (!file || !fs.existsSync(file)) { console.log('missing', route.request().url()); return route.fulfill({ status: 404, body: '' }); }
    route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: 'text/javascript' });
  });
  // Google Fonts: blank by default (fallback fonts); FONTS=1 fetches the real ones through curl (it uses the
  // container's proxy settings, which the browser doesn't), so layouts match the live site.
  const { execFileSync } = require('child_process');
  await p.route(/fonts\.(googleapis|gstatic)\.com/, route => {
    if (!process.env.FONTS) return route.fulfill({ status: 200, body: '', contentType: 'text/css' });
    const url = route.request().url();
    try {
      const body = execFileSync('curl', ['-s', '--fail', '-A', 'Mozilla/5.0 Chrome/120', url], { maxBuffer: 1 << 26 });
      route.fulfill({ status: 200, body, contentType: url.includes('googleapis') ? 'text/css' : 'font/woff2' });
    } catch { route.fulfill({ status: 404, body: '' }); }
  });
  await p.goto('http://local.test/' + page);
  await p.waitForFunction(() => window.ready, null, { timeout: +(process.env.TIMEOUT || 240000) });
  for (const [n, expr] of JSON.parse(viewsJson)) {
    await p.evaluate(expr);
    await p.waitForTimeout(+(process.env.WAIT || 300));
    await p.screenshot({ path: n });
  }
  await b.close();
})();
