// Renders report.html to report.pdf (A4) with the Playwright installed in client/.
// Run from the repository root: node docs/report/build-pdf.cjs
const path = require('path');
const { chromium } = require(path.join(__dirname, '../../client/node_modules/playwright'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'report.html'), { waitUntil: 'load' });
  await page.pdf({ path: path.join(__dirname, 'report.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log('Wrote docs/report/report.pdf');
})();
