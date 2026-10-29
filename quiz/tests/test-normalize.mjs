import fs from 'fs';
import vm from 'vm';
import assert from 'assert';

const code = fs.readFileSync(new URL('../normalize.js', import.meta.url), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const N = sandbox.window.QuizNormalize;

function expectMatch(raw, accepted, ok) {
  const m = N.matchesAccepted(raw, accepted);
  assert.strictEqual(m.ok, ok, `${raw} => ${m.ok} (norm=${m.norm}) expected ${ok}`);
}

expectMatch('Ixion', ['Ixion'], true);
expectMatch('it was Ixion', ['Ixion'], true);
expectMatch('the Ixion', ['Ixion'], true);
expectMatch('Chiron', ['Chiron', 'Cheiron'], true);
expectMatch('Cheiron', ['Chiron', 'Cheiron'], true);
expectMatch('Cecrops', ['Cecrops', 'Kekrops'], true);
expectMatch('Kekrops', ['Cecrops', 'Kekrops'], true);
expectMatch('Hektor', ['Hector'], true);
expectMatch('Menelaos', ['Menelaus'], true);
expectMatch('Agamemnonn', ['Agamemnon'], true);

const g = N.gradeMc([2], [2], false);
assert.ok(g.exact);
const g2 = N.gradeMc([0, 1], [0, 1, 3], true);
assert.ok(g2.partial && !g2.exact);
const g3 = N.gradeMc([0, 1, 3], [0, 1, 3], true);
assert.ok(g3.exact);

assert.strictEqual(N.questionKind({ type: 'type' }), 'short');
assert.strictEqual(N.questionKind({ type: 'short' }), 'short');
assert.strictEqual(N.sanitizeNick('Alex!!!'), 'Alex');
assert.strictEqual(N.uniquifyNick('Alex', { a: { nick: 'Alex' } }, 'b'), 'Alex 2');

const score = N.scoreForAnswer(
  { type: 'short', accepted: ['Ixion'] },
  { raw: 'Ixion', at: 1000 },
  1000
);
assert.strictEqual(score, 1500);

const quiz = JSON.parse(fs.readFileSync(new URL('../quizzes/lecture-review-1.json', import.meta.url), 'utf8'));
assert.strictEqual(quiz.questions.length, 10);
const kinds = quiz.questions.map((q) => N.questionKind(q));
assert.ok(kinds.includes('mc') && kinds.includes('cloud') && kinds.includes('open') && kinds.includes('short'));

console.log('normalize + quiz JSON: OK');

// Hard Mode mapping
const hmQ = {
  type: 'mc', multi: true,
  options: ['Agamemnon', 'Menelaus', 'Hector', 'Orestes', 'Priam', 'Clytemnestra', 'Electra'],
  correct: [0, 1, 3, 5, 6],
  aliases: { Clytemnestra: ['Klytaimnestra'], Electra: ['Elektra'], Menelaus: ['Menelaos'] }
};
const hm = N.gradeHardModeMc('Klytaimnestra, Elektra, Agamemnon, Menelaos, Orestes', hmQ);
assert(hm.exact, 'hard mode Atreus aliases should exact-match');
const hm2 = N.gradeHardModeMc('Aphrodite', { type: 'mc', multi: false, options: ['Hera', 'Athena', 'Aphrodite'], correct: [2] });
assert(hm2.exact, 'hard mode single Aphrodite');
console.log('hard-mode normalize: OK');
