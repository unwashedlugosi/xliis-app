const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const horns = read('horns-1973.html');

const permanentLinks = [
  '/cornell.html',
  '/wall-of-sound.html',
  '/young-bettys.html',
  '/new-animal.html',
];

const jCards = [
  'jcards/gd1973-09-11.152009.sbd.gems.flac16.jpg',
  'jcards/gd73-09-12.sbd.sly.14010.sbeok.shnf.jpg',
  'jcards/gd73-09-15.aud-sbd.cotsman.16174.sbeok.shnf.jpg',
  'jcards/gd1973-09-17.150977.sbd.patched.miller.flac1644.jpg',
  'jcards/gd73-09-20.aud-sbd.cotsman.11618.sbeok.shnf.jpg',
  'jcards/gd1973-09-21.145131.sbd.boswell.smith.sirmick.flac1644.jpg',
  'jcards/gd73-09-24.sbd-aud.cotsman.11620.sbeok.shnf.jpg',
  'jcards/gd1973-09-26.sbd-repatched.miller.80198.sbeok.flac16.jpg',
];

test('homepage keeps all permanent collections distinct and adds Petite Collections', () => {
  for (const link of permanentLinks) assert.match(index, new RegExp(`href="${link.replace('.', '\\.')}"`));
  assert.match(index, /THE PERMANENT COLLECTIONS/);
  assert.match(index, /170 shows/);
  assert.match(index, /170[\s\S]*PERMANENT SHOWS/);
  assert.match(index, /FOUR[\s\S]*PERMANENT COLLECTIONS/);
  assert.match(index, /LES PETITES COLLECTIONS/);
  assert.match(index, /href="\/horns-1973\.html"/);
  assert.match(index, /8 shows · September 1973/);
  assert.match(index, /NEW PETITE COLLECTIONS COMING SOON\./);
  assert.match(index, /Permanent-collection J-cards are photographed\. Petite Collections include a landscape card for each show\./);
});

test('Horns page preserves the exact approved collection description', () => {
  const first = 'In September 1973, the Grateful Dead took a horn section on tour. They had never done it before, and they never did it again. With no known advance announcement, Martin Fierro’s saxophone and Joe Ellis’s trumpet joined the band for eight East Coast shows.';
  const second = 'You can hear them finding their way into Eyes of the World, Weather Report Suite and the long improvisations of the second sets. Sometimes the horns follow the song; sometimes they open up another conversation. The experiment lasted just over two weeks.';
  assert.ok(horns.includes(first));
  assert.ok(horns.includes(second));
});

test('Horns page lists exactly eight shows and all eight real J-card assets', () => {
  assert.equal((horns.match(/class="show-row"/g) || []).length, 8);
  assert.equal((horns.match(/class="jcard-thumb"/g) || []).length, 8);
  for (const card of jCards) {
    assert.ok(horns.includes(`src="${card}"`), `${card} is referenced`);
    assert.ok(fs.existsSync(path.join(root, card)), `${card} exists`);
  }
  assert.ok(fs.existsSync(path.join(root, 'collection-artwork/horns_1973.png')));
});

test('invented collector frame is disclosed and makes no ownership or photography claim', () => {
  assert.match(horns, /fictional lending-library frame/);
  assert.doesNotMatch(horns, /his original (?:cassette|tape)|his J-card|photographed from|owned these tapes/i);
});

test('local links and assets on changed pages resolve in the prepared site', () => {
  for (const [file, html] of [['index.html', index], ['horns-1973.html', horns]]) {
    const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const reference of references) {
      if (/^(?:https?:|data:|#)/.test(reference)) continue;
      const clean = reference.split('#')[0].split('?')[0];
      if (!clean || clean === '/') continue;
      const target = path.join(root, clean.replace(/^\//, ''));
      assert.ok(fs.existsSync(target), `${file}: ${reference} resolves`);
    }
  }
});
