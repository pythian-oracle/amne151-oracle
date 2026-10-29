import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
let playwright;
try {
  playwright = await import(pathToFileURL('/tmp/node_modules/playwright/index.mjs').href);
} catch {
  playwright = createRequire('/tmp/package.json')('playwright');
}

const server = spawn('python3', ['-m', 'http.server', '8767'], { cwd: root, stdio: 'ignore' });
await sleep(600);
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));

await page.goto('http://127.0.0.1:8767/quiz/host.html', { waitUntil: 'networkidle' });
await page.click('#startRoomBtn');
for (let i = 0; i < 40; i++) {
  await sleep(200);
  const ok = await page.evaluate(() => !document.getElementById('live').classList.contains('hidden'));
  if (ok) break;
}
const room = (await page.textContent('#roomCodeDisplay')).trim();
console.log('ROOM', room);

const probes = await page.evaluate(async (roomCode) => {
  const cfg = window.FIREBASE_CONFIG;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js');
  const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');
  const { getDatabase, ref, set, remove, update } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js');
  const app2 = initializeApp(cfg, 'probe-' + Math.random().toString(36).slice(2));
  const auth = getAuth(app2);
  await signInAnonymously(auth);
  const uid = auth.currentUser.uid;
  const database = getDatabase(app2);
  const results = { uid };

  async function tryWrite(label, path, payload) {
    try {
      await set(ref(database, path), payload);
      results[label] = 'OK';
    } catch (e) {
      results[label] = e.code || e.message;
    }
  }

  await tryWrite('short_legacy_raw_norm_at', `rooms/${roomCode}/answers/0/${uid}`, {
    raw: 'Ixion',
    norm: 'ixion',
    at: Date.now(),
  });
  await tryWrite('short_with_kind', `rooms/${roomCode}/answers/0/${uid}`, {
    kind: 'short',
    raw: 'Ixion',
    norm: 'ixion',
    at: Date.now(),
  });
  await tryWrite('mc_choiceStr', `rooms/${roomCode}/answers/7/${uid}`, {
    kind: 'mc',
    choiceStr: '2',
    raw: 'Aphrodite',
    norm: 'aphrodite',
    at: Date.now(),
  });
  await tryWrite('mc_array_only', `rooms/${roomCode}/answers/7/${uid}b`, {
    kind: 'mc',
    raw: [2],
    norm: [2],
    at: Date.now(),
  });
  await tryWrite('cloud_words', `rooms/${roomCode}/answers/9/${uid}`, {
    kind: 'cloud',
    words: { 0: { raw: 'wrath', norm: 'wrath' }, 1: { raw: 'pride', norm: 'pride' } },
    raw: 'wrath, pride',
    norm: 'wrath pride',
    at: Date.now(),
  });
  await tryWrite('players', `rooms/${roomCode}/players/${uid}`, {
    nick: 'TestNick',
    joinedAt: Date.now(),
  });
  // host-style meta patch with questionOpenedAt — use host page's auth instead
  results.note = 'questionOpenedAt tested via host next already';

  // wipe with this uid should FAIL (not host)
  try {
    await remove(ref(database, `rooms/${roomCode}`));
    results.wipe_as_player = 'OK (unexpected)';
  } catch (e) {
    results.wipe_as_player = e.code || e.message;
  }
  return results;
}, room);

console.log(JSON.stringify(probes, null, 2));

// wipe as host
await page.click('#endBtn');
await sleep(1500);
await browser.close();
server.kill('SIGTERM');
