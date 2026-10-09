// Reads the content in data/ and draws tasks without repeats.

import { SYLLABLES } from '../data/syllables.js';
import { QUESTIONS } from '../data/questions.js';
import { COMPOUNDS } from '../data/compounds.js';
import { SCRAMBLE } from '../data/scramble.js';
import { CHAINS } from '../data/chains.js';

const lines = (s) => s.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const cells = (l) => l.split('|').map((x) => x.trim());

const parseSyl = (s) => lines(s).map((l) => {
  const [text, pos, lvl] = l.split(':');
  return { text, pos, lvl: +lvl };
});
const parsePairs3 = (s) => lines(s).map((l) => {
  const [lvl, de, en] = cells(l);
  return { lvl: +lvl, de, en };
});
const parseWords = (s) => lines(s).map((l) => {
  const [lvl, word] = cells(l);
  return { lvl: +lvl, word };
});
const parsePairs2 = (s) => lines(s).map((l) => {
  const [de, en] = cells(l);
  return { de, en };
});

const SYL = { de: parseSyl(SYLLABLES.de), en: parseSyl(SYLLABLES.en) };
// Bilingual: only syllables that work in both languages
SYL.both = SYL.de
  .map((a) => {
    const b = SYL.en.find((x) => x.text === a.text);
    if (!b) return null;
    const pos = [...a.pos].filter((p) => b.pos.includes(p)).join('');
    return { text: a.text, pos, lvl: Math.max(a.lvl, b.lvl) };
  })
  .filter(Boolean);

const QUE = parsePairs3(QUESTIONS);
const COM = parsePairs3(COMPOUNDS);
const SCR = { de: parseWords(SCRAMBLE.de), en: parseWords(SCRAMBLE.en) };
const CHA = { simple: parsePairs2(CHAINS.simple), compound: parsePairs2(CHAINS.compound) };

export const CONTENT = { SYL, QUE, COM, SCR, CHA };

const rnd = (n) => Math.floor(Math.random() * n);
export function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

const levelOk = (lvl, diff) => (diff === 'easy' ? lvl === 1 : diff === 'mid' ? lvl <= 2 : lvl >= 2);

// Draw bags: nothing comes back before everything has had its turn
const bags = {};
function draw(key, make) {
  if (!bags[key] || !bags[key].length) bags[key] = shuffle(make());
  return bags[key].pop();
}

function weighted(options) {
  const total = options.reduce((s, o) => s + o[1], 0);
  let r = Math.random() * total;
  for (const [v, w] of options) {
    r -= w;
    if (r < 0) return v;
  }
  return options[0][0];
}

const POS_WEIGHT = {
  easy: { any: 3, start: 3, end: 1, mid: 0 },
  mid: { any: 2, start: 2, end: 2, mid: 1 },
  hard: { any: 1, start: 1, end: 3, mid: 3 },
};
const POS_FLAG = { start: 's', end: 'e', mid: 'm' };

const LETTERS = {
  easy: 'ABCDEHJKLMPRST',
  mid: 'ABCDEFGHJKLMNOPRSTW',
  hard: 'FGINOUVWZ',
};

function scramble(word) {
  if (word.length < 2) return [...word];
  for (let i = 0; i < 20; i++) {
    const s = shuffle([...word]);
    if (s.join('') !== word) return s;
  }
  return [...word].reverse();
}

/**
 * @param cat   syllable | famous | question | compound | scramble | chain
 * @param lang  de | en | both
 * @param diff  easy | mid | hard
 */
export function drawTask(cat, lang, diff) {
  const key = `${cat}:${lang}:${diff}`;
  switch (cat) {
    case 'syllable': {
      const item = draw(key, () => SYL[lang].filter((x) => levelOk(x.lvl, diff)));
      const w = POS_WEIGHT[diff];
      const options = Object.keys(w)
        .filter((p) => w[p] > 0 && (p === 'any' || item.pos.includes(POS_FLAG[p])))
        .map((p) => [p, w[p]]);
      return { cat, text: item.text, pos: weighted(options), allowed: item.pos };
    }
    case 'famous': {
      const pool = LETTERS[diff];
      const a = pool[rnd(pool.length)];
      let b = a;
      while (b === a) b = pool[rnd(pool.length)];
      return { cat, a, b };
    }
    case 'question': {
      const item = draw(`question:${diff}`, () => QUE.filter((x) => levelOk(x.lvl, diff)));
      return { cat, de: item.de, en: item.en };
    }
    case 'compound': {
      const item = draw(`compound:${diff}`, () => COM.filter((x) => levelOk(x.lvl, diff)));
      return { cat, de: item.de, en: item.en };
    }
    case 'scramble': {
      const l = lang === 'both' ? (Math.random() < 0.5 ? 'de' : 'en') : lang;
      const item = draw(`scramble:${l}:${diff}`, () => SCR[l].filter((x) => levelOk(x.lvl, diff)));
      return { cat, letters: scramble(item.word), word: item.word };
    }
    case 'chain': {
      const rule = diff === 'easy'
        ? 'assoc'
        : diff === 'mid'
          ? weighted([['letter', 7], ['assoc', 3]])
          : weighted([['compound', 6], ['letter', 4]]);
      const list = rule === 'compound' ? 'compound' : 'simple';
      const item = draw(`chain:${list}`, () => CHA[list]);
      return { cat, rule, de: item.de, en: item.en };
    }
    default:
      throw new Error(`Unknown category: ${cat}`);
  }
}
