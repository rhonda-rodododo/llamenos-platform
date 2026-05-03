import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', msg => {
  if (msg.text().includes('tauri-mock') || msg.text().includes('Failed'))
    console.log('CONSOLE:', msg.text());
});
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

// Replicate loginAsAdmin exactly
await page.goto('http://localhost:8788/login');
await page.evaluate(() => {
  sessionStorage.clear();
  localStorage.removeItem('llamenos-encrypted-key');
  localStorage.removeItem('tauri-store:keys.json:llamenos-encrypted-key');
});
await page.reload();
await page.waitForLoadState('domcontentloaded');

const hasPlatform = await page.waitForFunction(
  () => !!(window).__TEST_PLATFORM,
  { timeout: 10000 }
).then(() => true).catch(() => false);
console.log('__TEST_PLATFORM available:', hasPlatform);

if (hasPlatform) {
  try {
    const result = await page.evaluate(async ({ nsec, pin }) => {
      const platform = window.__TEST_PLATFORM;
      const publicKey = await platform.pubkeyFromNsec(nsec);
      if (!publicKey) return 'FAILED: pubkeyFromNsec returned null';
      await platform.encryptWithPin(nsec, pin, publicKey);
      await platform.lockCrypto();
      return 'OK: ' + publicKey;
    }, {
      nsec: 'nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh',
      pin: '12345678'
    });
    console.log('RESULT:', result);
  } catch (e) {
    console.log('ERROR:', e.message);
  }
}

await browser.close();
