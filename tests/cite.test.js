// Run: node tests/cite.test.js
var C = require('../cite.js'), assert = require('assert'), pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); } }
// The ✔️ examples from the Project Proposal Guide (info.html)
var GOOD = {
  primary: 'Pindar. Olympian Odes. Pythian Odes. Edited and translated by William H. Race. Loeb Classical Library 56. Cambridge, MA: Harvard University Press, 1997.',
  book: 'Braswell, Bruce Karl. A Commentary on the Fourth Pythian Ode of Pindar. Vol. 14. Berlin: De Gruyter, 1988.',
  section: 'Smith, R. R. R. \u201CPindar, Athletes, and the Early Greek Statue Habit.\u201D In Pindar\u2019s Poetry, Patrons, and Festivals, edited by Simon Hornblower and Catherine Morgan, 83\u2013139. Oxford: Oxford University Press, 2007.',
  journal: 'Potamiti, Anna. \u201CThe Theme of Hospitality in Pindar\u2019s Fourth Pythian.\u201D Greece and Rome 62, no. 1 (2015): 1-11. Doi: 10.1017/S0017383514000205.',
  object: 'Silver coin from Cyrene, 480 BC - 435 BC. Coin. British Museum. (EH,p697.3.Cyr). https://www.britishmuseum.org/collection/object/C_EH-p697-3-Cyr.'
};
var ITAL = { primary: 'Olympian Odes. Pythian Odes', book: 'A Commentary on the Fourth Pythian Ode of Pindar', section: 'Pindar\u2019s Poetry, Patrons, and Festivals', journal: 'Greece and Rome' };
Object.keys(GOOD).forEach(function (k) {
  t('maker "Fill example" reproduces the guide example: ' + k, function () {
    var r = C.make(k, C.example(k));
    assert.strictEqual(r.text, GOOD[k]);
    if (ITAL[k]) assert.ok(r.html.indexOf('<em>' + ITAL[k] + '</em>') >= 0, 'italic title missing: ' + r.html);
  });
});
t('primary example keeps its annotation', function () { assert.ok(/facing pages/.test(C.make('primary', C.example('primary')).annotation)); });
t('headline style', function () {
  assert.strictEqual(C.headline('pindar, athletes, and the early greek statue habit'), 'Pindar, Athletes, and the Early Greek Statue Habit');
  assert.strictEqual(C.headline('poetry : from archaic greece to the roman empire'), 'Poetry: From Archaic Greece to the Roman Empire');
});
// The ❌ examples
t('fixer: Braswell (UBC catalogue mess) -> guide ✔️', function () {
  var r = C.fix('Braswell, Bruce Karl. A Commentary on the Fourth Pythian Ode of Pindar. Vol. Bd. 14.;Bd. 14;. New York;Berlin;: De Gruyter, 1988.');
  assert.strictEqual(r.text, GOOD.book); assert.ok(r.html.indexOf('<em>A Commentary on the Fourth Pythian Ode of Pindar</em>') >= 0);
});
t('fixer: Potamiti (lowercase "the", straight quotes) -> guide ✔️', function () {
  var r = C.fix('Potamiti, Anna. "the Theme of Hospitality in Pindar\'s Fourth Pythian." Greece and Rome 62, no. 1 (2015): 1-11. Doi: 10.1017/S0017383514000205.');
  assert.strictEqual(r.text, GOOD.journal); assert.ok(r.html.indexOf('<em>Greece and Rome</em>') >= 0);
});
t('fixer: Smith (Google Scholar) -> fixes title/italics, warns it is a book section and about initials', function () {
  var r = C.fix('Smith, Roland RR. "Pindar, athletes, and the early Greek statue habit." Pindar\u2019s Poetry, Patrons, and Festivals: From Archaic Greece to the Roman Empire (2007): 83-139.  \t(from Google Scholar)');
  assert.strictEqual(r.text, 'Smith, Roland RR. \u201CPindar, Athletes, and the Early Greek Statue Habit.\u201D Pindar\u2019s Poetry, Patrons, and Festivals: From Archaic Greece to the Roman Empire (2007): 83-139.');
  assert.strictEqual(r.type, 'section');
  assert.ok(r.warnings.some(function (w) { return /Book Section/.test(w); }));
  assert.ok(r.warnings.some(function (w) { return /initials/.test(w); }));
});
t('fixer: Hornblower (UBC catalogue, edited book) -> eds., one place, italics, warns to cite the chapter', function () {
  var r = C.fix("Hornblower, Simon and Catherine Morgan. Pindar's Poetry, Patrons, and Festivals: From Archaic Greece to the Roman Empire, edited by Hornblower, Simon, Catherine Morgan. Oxford;Toronto;: Oxford University Press, 2007.   \t\t(from UBC Catalog)");
  assert.strictEqual(r.text, 'Hornblower, Simon, and Catherine Morgan, eds. Pindar\u2019s Poetry, Patrons, and Festivals: From Archaic Greece to the Roman Empire. Oxford: Oxford University Press, 2007.');
  assert.ok(r.warnings.some(function (w) { return /chapter/.test(w); }));
});
t('fixer: strips the long UBC summon URL', function () {
  var r = C.fix('Potamiti, Anna. "The Theme of Hospitality in Pindar\'s Fourth Pythian." Greece and Rome 62, no. 1 (2015): 1-11. http://ubc.summon.serialssolutions.com/2.0.0/link/0/eLvHCXMwfV07D8Ig');
  assert.ok(!/summon/.test(r.text)); assert.ok(r.notes.some(function (n) { return /library link/.test(n); }));
});
t('fixer: empty input is handled', function () { assert.strictEqual(C.fix('').text, ''); });
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
