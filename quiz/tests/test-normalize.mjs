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
assert.strictEqual(N.questionKind({ type: 'hardModeGate' }), 'hardModeGate');
assert.ok(N.isHardModeGate({ type: 'hardModeGate' }));
assert.ok(!N.isGradable({ type: 'hardModeGate' }));
assert.strictEqual(N.sanitizeNick('Alex!!!'), 'Alex');
assert.strictEqual(N.uniquifyNick('Alex', { a: { nick: 'Alex' } }, 'b'), 'Alex 2');

const score = N.scoreForAnswer(
  { type: 'short', accepted: ['Ixion'] },
  { raw: 'Ixion', at: 1000 },
  1000
);
assert.strictEqual(score, 1500);

const quiz = JSON.parse(fs.readFileSync(new URL('../quizzes/lecture-review-1.json', import.meta.url), 'utf8'));
assert.strictEqual(quiz.questions.length, 12);
assert.strictEqual(N.countableLength(quiz.questions), 11);
const kinds = quiz.questions.map((q) => N.questionKind(q));
assert.ok(kinds.includes('mc') && kinds.includes('cloud') && kinds.includes('open') && kinds.includes('short'));
assert.ok(kinds.includes('hardModeGate'));
const gateIdx = kinds.indexOf('hardModeGate');
assert.strictEqual(gateIdx, 6, 'gate after Judgement (before Earth-born)');
assert.deepStrictEqual(
  quiz.questions.map((q) => q.id),
  ['i0a', 'h1', 'h2', 'h4', 'i4', 'i5', 'hm-gate', 'h3', 'i0b', 'i7', 'i8', 'i0c']
);
assert.strictEqual(N.displayQuestionNumber(quiz.questions, 5), 6);
assert.strictEqual(N.displayQuestionNumber(quiz.questions, 6), null);
assert.strictEqual(N.displayQuestionNumber(quiz.questions, 7), 7);
assert.strictEqual(N.displayQuestionNumber(quiz.questions, 8), 8);
const h3 = quiz.questions.find((q) => q.id === 'h3');
assert.ok(h3 && h3.type === 'mc' && h3.multi, 'h3 must be multi MC');
assert.deepStrictEqual(h3.correct, [0, 2, 4]);
assert.ok(h3.aliases && h3.aliases.Cecrops && h3.aliases.Cecrops.includes('Kekrops'));
const h3hm = N.gradeHardModeMc('Kekrops, Erechtheus Erichthonios', h3);
assert(h3hm.exact, 'earth-born hard mode aliases should exact-match: ' + JSON.stringify(h3hm.mapped));

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

// parseHardModeEntries: commas, spaces, mixed, dedupe, multi-word phrases
function expectEntries(raw, phrases, expected) {
  const got = N.parseHardModeEntries(raw, phrases);
  assert.strictEqual(JSON.stringify([...got]), JSON.stringify(expected),
    'parseHardModeEntries(' + JSON.stringify(raw) + ') => ' + JSON.stringify([...got]));
}
const phrases = ['House of Atreus', 'House of Cadmus', 'Mask of Agamemnon', 'Agamemnon', 'Hector'];
expectEntries('Hector, Priam, Hecuba', phrases, ['Hector', 'Priam', 'Hecuba']);
expectEntries('Hector Priam Hecuba', phrases, ['Hector', 'Priam', 'Hecuba']);
expectEntries('Hector, Priam Hecuba; Cassandra\nAndromache', phrases, ['Hector', 'Priam', 'Hecuba', 'Cassandra', 'Andromache']);
expectEntries('Hector hector PRIAM', phrases, ['Hector', 'PRIAM']);
expectEntries('House of Atreus Hector House of Cadmus', phrases, ['House of Atreus', 'Hector', 'House of Cadmus']);
expectEntries('Mask of Agamemnon, Hector', phrases, ['Mask of Agamemnon', 'Hector']);
// Via mapHardModeAnswer with a multi-word alias on an option
const mwQ = {
  type: 'mc', multi: true,
  options: ['Agamemnon', 'Hector', 'Priam'],
  correct: [0, 1],
  aliases: { Agamemnon: ['Mask of Agamemnon'] }
};
const mw = N.gradeHardModeMc('Mask of Agamemnon Hector', mwQ);
assert(mw.exact, 'multi-word alias kept intact when splitting on spaces: ' + JSON.stringify(mw.mapped));
console.log('hard-mode parse entries: OK');

// Not-on-Achilles'-side MC (Trojans + allies): partial credit + aliases
const argQ = quiz.questions.find((q) => q.id === 'i8');
assert.ok(argQ && argQ.multi && (argQ.correct || []).length === 5);
const argPartial = N.gradeHardModeMc('Hector, Paris, Achilles', argQ);
assert.ok(argPartial.partial && !argPartial.exact, 'partial when some correct + one Achaean');
assert.strictEqual(argPartial.hit, 2);
const argExact = N.gradeHardModeMc('Hektor Alexandros Aineias Priamos Sarpedon', argQ);
assert(argExact.exact, 'exact with aliases: ' + JSON.stringify(argExact.mapped));
const argScore = N.scoreForAnswer(argQ, { raw: 'Hector, Priam', hardMode: true, at: 1000 }, 1000);
assert.ok(argScore > 0 && argScore < 1500, 'partial hard-mode score between 0 and full: ' + argScore);
console.log('argives hard-mode partial/exact: OK');
