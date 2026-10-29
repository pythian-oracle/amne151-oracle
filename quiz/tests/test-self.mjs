/**
 * Self-quiz E2E — final order:
 * Paris mc, Ixion, Chiron, Schliemann open, Judgement open,
 * Hard Mode gate, Earth-born multi-MC, Atreus/Troy/Argives multi, cloud.
 */
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const shotsDir = '/workspace/AMNE151/quiz-shots';
fs.mkdirSync(shotsDir, { recursive: true });

let playwright;
try {
  playwright = await import(pathToFileURL('/tmp/node_modules/playwright/index.mjs').href);
} catch {
  playwright = createRequire('/tmp/package.json')('playwright');
}

async function checkAndNext(page) {
  if (await page.isVisible('#checkBtn')) {
    await page.click('#checkBtn');
    await page.waitForSelector('#feedback:not(.hidden)');
  }
  if (await page.isVisible('#nextBtn')) await page.click('#nextBtn');
}

async function answerMc(page, indices) {
  await page.waitForSelector('#mcBox:visible');
  for (const ix of indices) await page.check('#mc_' + ix);
  await checkAndNext(page);
}

/** Through Paris, Ixion, Chiron, Schliemann, Judgement — then gate. */
async function answerThroughPreGate(page) {
  await answerMc(page, [2]); // Paris
  await page.waitForSelector('#answer:visible');
  await page.fill('#answer', 'it was Ixion');
  await checkAndNext(page);
  await page.fill('#answer', 'Cheiron');
  await checkAndNext(page);
  await page.waitForSelector('#answerLong:visible');
  await page.fill('#answerLong', 'excavated Troy');
  await checkAndNext(page);
  await page.fill('#answerLong', 'judgement of paris');
  await checkAndNext(page);
}

async function finishAfterGateNormal(page) {
  // Earth-born multi-MC
  await answerMc(page, [0, 2, 4]);
  // Atreus, Troy, Argives as normal MC
  await answerMc(page, [0, 1, 3, 5, 6]); // Atreus
  await answerMc(page, [0, 1, 3, 5, 6]); // Troy
  await answerMc(page, [0, 2, 4, 6, 8, 10, 11, 12]); // Argives
  await page.waitForSelector('#cloudBox:visible');
  const inputs = page.locator('#cloudBox input');
  await inputs.nth(0).fill('wrath');
  await inputs.nth(1).fill('pride');
  await checkAndNext(page);
}

const server = spawn('python3', ['-m', 'http.server', '8765'], { cwd: root, stdio: 'ignore' });
await sleep(700);
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto('http://127.0.0.1:8765/quiz/self.html?quiz=lecture-review-1', { waitUntil: 'networkidle' });
  await page.waitForSelector('#startBtn:not([disabled])', { timeout: 10000 });
  assert.strictEqual(await page.locator('#hardModeSelf').count(), 0, 'hardModeSelf toggle must be removed');
  await page.click('#startBtn');

  await answerThroughPreGate(page);

  await page.waitForSelector('#hmGateBox:visible');
  assert.ok(/Hard Mode/i.test(await page.textContent('#prompt')));
  await page.click('#hmGateChooseMc');

  await finishAfterGateNormal(page);

  await page.waitForSelector('#done', { timeout: 10000 });
  const score = (await page.textContent('#scoreLine')).trim();
  console.log('self-quiz branch(a) E2E: OK —', score);
  assert.ok(/got/i.test(score));

  const review = await page.textContent('#selfReviewList');
  assert.ok(/Your answer/i.test(review), 'self review missing your answer');
  assert.ok(/Ixion|Aphrodite|Argives|Troy|wrath|Nestor|Cecrops|Erechtheus/i.test(review), 'self review missing content');
  assert.ok(!/Hard Mode\?/i.test(review), 'gate must not appear in review');
  assert.ok(/Correct|Incorrect|No mark|Partial/i.test(review), 'self review missing marks');
  await page.screenshot({ path: path.join(shotsDir, 'self-review.png'), fullPage: true });
  console.log('SHOT: self-review.png');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

// ---- Hard Mode branch (b) — single textarea ----
{
  const browser2 = await playwright.chromium.launch({ headless: true });
  const page2 = await browser2.newPage();
  const server2 = spawn('python3', ['-m', 'http.server', '8766'], { cwd: root, stdio: 'ignore' });
  await sleep(600);
  try {
    await page2.goto('http://127.0.0.1:8766/quiz/self.html?quiz=lecture-review-1', { waitUntil: 'networkidle' });
    await page2.waitForSelector('#startBtn:not([disabled])', { timeout: 10000 });
    await page2.click('#startBtn');

    await answerThroughPreGate(page2);

    await page2.waitForSelector('#hmGateBox:visible');
    await page2.click('#hmGateChooseType');

    // Earth-born — Hard Mode typing (aliases)
    await page2.waitForSelector('#hardMcBox textarea.hard-entry:visible');
    assert.strictEqual(await page2.locator('button.hard-add').count(), 0, 'no Add button');
    assert.strictEqual(await page2.locator('.hard-count-hint').count(), 0, 'no duplicate hard-count hint');
    assert.ok(/Name as many as you can/i.test(await page2.textContent('#typeHint')));
    // Empty sample text in the box
    assert.strictEqual(await page2.getAttribute('#hardMcBox textarea.hard-entry', 'placeholder'), null);
    await page2.fill(
      '#hardMcBox textarea.hard-entry',
      'Kekrops, Erechtheus Erichthonios'
    );
    await page2.click('#checkBtn');
    await page2.waitForSelector('#feedback:not(.hidden)');
    assert.ok(/Correct/i.test(await page2.textContent('#feedback')));
    await page2.click('#nextBtn');

    // Atreus — single hard textarea, space+comma mix
    await page2.waitForSelector('#hardMcBox textarea.hard-entry:visible');
    assert.ok(/Name as many as you can/i.test(await page2.textContent('#typeHint')));
    await page2.fill(
      '#hardMcBox textarea.hard-entry',
      'Klytaimnestra Elektra, Agamemnon Menelaos Orestes'
    );
    await page2.click('#checkBtn');
    await page2.waitForSelector('#feedback:not(.hidden)');
    const fb = await page2.textContent('#feedback');
    assert.ok(/Correct|You typed/i.test(fb), fb);
    await page2.screenshot({ path: path.join(shotsDir, 'hard-mode-self.png'), fullPage: true });
    console.log('SHOT: hard-mode-self.png');

    await page2.click('#nextBtn');
    // Troy
    await page2.waitForSelector('#hardMcBox textarea.hard-entry:visible');
    await page2.fill('#hardMcBox textarea.hard-entry', 'Hector, Priam, Hecuba, Cassandra, Andromache');
    await page2.click('#checkBtn');
    await page2.waitForSelector('#feedback:not(.hidden)');
    assert.ok(/Correct/i.test(await page2.textContent('#feedback')));

    await page2.click('#nextBtn');
    // Argives — long list + multi-word alias
    await page2.waitForSelector('#hardMcBox textarea.hard-entry:visible');
    await page2.fill(
      '#hardMcBox textarea.hard-entry',
      'Achilles Nestor Agamemmnon Ulysses Diomede Menelaos Ajax the Great Patroklos'
    );
    await page2.click('#checkBtn');
    await page2.waitForSelector('#feedback:not(.hidden)');
    assert.ok(/Correct/i.test(await page2.textContent('#feedback')));
    console.log('self-quiz hard-mode branch(b) E2E: OK');
  } finally {
    await browser2.close();
    server2.kill('SIGTERM');
  }
}
