import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import assert from 'assert';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
let playwright;
try {
  playwright = await import(pathToFileURL('/tmp/node_modules/playwright/index.mjs').href);
} catch {
  const req = createRequire('/tmp/package.json');
  playwright = req('playwright');
}

const server = spawn('python3', ['-m', 'http.server', '8765'], { cwd: root, stdio: 'ignore' });
await sleep(700);
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage();

async function checkAndNext() {
  if (await page.isVisible('#checkBtn')) {
    await page.click('#checkBtn');
    await page.waitForSelector('#feedback:not(.hidden)');
  }
  if (await page.isVisible('#nextBtn')) await page.click('#nextBtn');
}

try {
  await page.goto('http://127.0.0.1:8765/quiz/self.html?quiz=lecture-review-1', { waitUntil: 'networkidle' });
  await page.click('#startBtn');

  // Q1 short Ixion
  await page.waitForSelector('#answer:visible');
  await page.fill('#answer', 'it was Ixion');
  await checkAndNext();

  // Q2 Cheiron
  await page.fill('#answer', 'Cheiron');
  await checkAndNext();

  // Q3 Cecrops
  await page.fill('#answer', 'Cecrops');
  await checkAndNext();

  // Q4 open
  await page.waitForSelector('#answerLong:visible');
  await page.fill('#answerLong', 'excavated Troy');
  await checkAndNext();

  // Q5 open
  await page.fill('#answerLong', 'judgement of paris');
  await checkAndNext();

  // Q6 short
  await page.waitForSelector('#answer:visible');
  await page.fill('#answer', 'Agamemnon');
  await checkAndNext();

  // Q7 short
  await page.fill('#answer', 'Hector');
  await checkAndNext();

  // Q8 MC single Aphrodite = index 2
  await page.waitForSelector('#mcBox:visible');
  await page.check('#mc_2');
  await checkAndNext();

  // Q9 MC multi 0,1,3
  await page.waitForSelector('#mcBox:visible');
  await page.check('#mc_0');
  await page.check('#mc_1');
  await page.check('#mc_3');
  await checkAndNext();

  // Q10 cloud
  await page.waitForSelector('#cloudBox:visible');
  const inputs = page.locator('#cloudBox input');
  await inputs.nth(0).fill('wrath');
  await inputs.nth(1).fill('pride');
  await checkAndNext();

  await page.waitForSelector('#done', { timeout: 10000 });
  const score = (await page.textContent('#scoreLine')).trim();
  console.log('self-quiz all-types E2E: OK —', score);
  assert.ok(/got/i.test(score));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
