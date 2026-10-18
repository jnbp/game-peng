// Checks the content in data/: format, duplicates, characters.  Run: node scripts/check-data.mjs
import { CONTENT, drawTask } from '../js/tasks.js';
import { CATS } from '../js/i18n.js';

const { SYL, QUE, COM, SCR, CHA, RHY, TOP, STO } = CONTENT;
let errors = 0;
const fail = (msg) => { errors += 1; console.log('ERROR  ' + msg); };
const dupes = (list, what) => {
  const seen = new Set();
  for (const x of list) {
    const k = x.toLowerCase();
    if (seen.has(k)) fail(`${what}: duplicate "${x}"`);
    seen.add(k);
  }
};

for (const l of ['de', 'en']) {
  for (const s of SYL[l]) {
    if (!/^[A-ZÄÖÜ]+$/.test(s.text)) fail(`syllables ${l}: "${s.text}" contains invalid characters`);
    if (!/^[sme]+$/.test(s.pos || '')) fail(`syllables ${l}: "${s.text}" has invalid positions "${s.pos}"`);
    if (![1, 2, 3].includes(s.lvl)) fail(`syllables ${l}: "${s.text}" has an invalid level`);
  }
  dupes(SYL[l].map((s) => s.text), `syllables ${l}`);
  for (const w of SCR[l]) {
    if (!/^[A-Z]{5,10}$/.test(w.word)) fail(`scramble ${l}: "${w.word}" must be 5 to 10 letters A-Z`);
    if (![1, 2, 3].includes(w.lvl)) fail(`scramble ${l}: "${w.word}" has an invalid level`);
  }
  dupes(SCR[l].map((w) => w.word), `scramble ${l}`);
}
for (const [name, list] of [['questions', QUE], ['compounds', COM]]) {
  for (const x of list) {
    if (![1, 2, 3].includes(x.lvl) || !x.de || !x.en) fail(`${name}: incomplete line "${x.de || x.en}"`);
  }
  dupes(list.map((x) => x.de), `${name} de`);
  dupes(list.map((x) => x.en), `${name} en`);
}
for (const k of ['simple', 'compound']) {
  for (const x of CHA[k]) if (!x.de || !x.en) fail(`chains ${k}: incomplete line "${x.de || x.en}"`);
  dupes(CHA[k].map((x) => x.de), `chains ${k} de`);
  dupes(CHA[k].map((x) => x.en), `chains ${k} en`);
}

for (const l of ['de', 'en']) {
  for (const w of RHY[l]) {
    if (!w.word || /\s/.test(w.word) || ![1, 2, 3].includes(w.lvl)) fail(`rhymes ${l}: invalid line "${w.word}"`);
  }
}
for (const x of TOP) if (![1, 2, 3].includes(x.lvl) || !x.de || !x.en) fail(`topics: incomplete line "${x.de || x.en}"`);
dupes(TOP.map((x) => x.en), 'topics en');
for (const x of STO) if (!x.de || !x.en) fail(`stories: incomplete line "${x.de || x.en}"`);
dupes(STO.map((x) => x.en), 'stories en');

// Every combination has to yield tasks
for (const cat of CATS) {
  for (const lang of ['de', 'en', 'both']) {
    for (const diff of ['easy', 'mid', 'hard']) {
      try {
        for (let i = 0; i < 300; i++) {
          const t = drawTask(cat, lang, diff);
          if (!t) throw new Error('empty');
          if (cat === 'syllable' && !t.pos) throw new Error('no position');
        }
      } catch (e) {
        fail(`${cat}/${lang}/${diff}: ${e.message}`);
      }
    }
  }
}

console.log(`Syllables: ${SYL.de.length} de, ${SYL.en.length} en, ${SYL.both.length} bilingual`);
console.log(`Questions: ${QUE.length} · Compounds: ${COM.length} · Scramble: ${SCR.de.length} de, ${SCR.en.length} en · Chains: ${CHA.simple.length} + ${CHA.compound.length}`);
console.log(`Rhymes: ${RHY.de.length} de, ${RHY.en.length} en · Topics: ${TOP.length} · Story starts: ${STO.length}`);
console.log(errors ? `${errors} error(s)` : 'All good');
process.exit(errors ? 1 : 0);
