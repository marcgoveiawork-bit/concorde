// usage: node tools/make-blueprint.js   (from the repo root) -> assets/blueprint.json + source/blueprint.png
// Renders tools/blueprint.html headlessly (same file serving as tools/screenshot.js) and saves the sheet.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), NM = path.join(__dirname, 'node_modules');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.route('http://local.test/**', route => {
    const file = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  });
  await p.route('https://cdn.jsdelivr.net/npm/**', route => {
    const m = new URL(route.request().url()).pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.*)$/);
    route.fulfill({ status: 200, body: fs.readFileSync(path.join(NM, m[1], m[2])), contentType: 'text/javascript' });
  });
  await p.goto('http://local.test/tools/blueprint.html');
  await p.waitForFunction(() => window.ready, null, { timeout: 300000 });
  const url = await p.evaluate(() => window.sheet);
  fs.writeFileSync(path.join(ROOT, 'assets/blueprint.json'), JSON.stringify([url]));
  fs.mkdirSync(path.join(ROOT, 'source'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'source/blueprint.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('blueprint', (url.length / 1e6).toFixed(2), 'MB');
  await b.close();
})();
