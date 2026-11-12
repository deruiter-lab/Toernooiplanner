// Onafhankelijke controle: toetst de uitkomst aan de afgesproken regels, zonder de planner zelf te vertrouwen.
const E = require('../src/engine.js'), V = require('../src/voorbeeld.js');
const S = require(process.argv[2] || './voorbeeld-staat.json'), PUB = {};
// zelfde volgorde als in Tally: Jan Mol en Anna Wolters schreven zich als laatsten in
const payload = JSON.parse(JSON.stringify(V.payload));
const subs = payload.data.submissions;
const naamVan = s => s.responses.find(r => r.questionId === 'WlqB0R').answer + ' ' + s.responses.find(r => r.questionId === 'aZzgG2').answer;
const rest = subs.filter(s => !['Jan Mol', 'Anna Wolters'].includes(naamVan(s)));
rest.forEach((s, i) => { s.submittedAt = `2026-11-12T20:${String(15 + Math.floor(i / 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`; });
const jan = subs.find(s => naamVan(s) === 'Jan Mol'), anna = subs.find(s => naamVan(s) === 'Anna Wolters');
jan.submittedAt = '2026-11-12T20:24:10.000Z'; anna.submittedAt = '2026-11-12T20:24:16.000Z';
payload.data.submissions = [...rest, jan, anna];
const spelers = E.leesTally(payload);
const R = E.volledig(spelers, S.niveaus, S.inst, S.besl);
const by = Object.fromEntries(spelers.map(p => [p.id, p]));
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fouten = [], letop = [], ok = [];
const slotLen = S.inst.duur + S.inst.pauze;

// 0. komt de herberekende planning overeen met wat spelers zien?
const wById = Object.fromEntries(R.wedstrijden.map(w => [w.id, w]));
const items = []; // {tijd, baan, d, groep, a, b, spelers}
R.planning.slots.forEach((sl, s) => sl.forEach((id, baan) => { if (id) { const w = wById[id]; items.push({ t: R.analyse.tijden[s], baan: baan + 1, w }); } }));
const naarNaam = id => by[id].naam;
Object.entries(PUB).forEach(([naam, lijst]) => {
  const p = spelers.find(x => x.naam === naam);
  const eigen = items.filter(i => i.w.spelers.includes(p.id)).sort((a, b) => a.t - b.t)
    .map(i => { const mijn = i.w.a.leden.includes(p.id) ? i.w.a : i.w.b; const teg = mijn === i.w.a ? i.w.b : i.w.a; return [E.toTijd(i.t), i.baan, i.w.d, teg.naam]; });
  const gelijk = JSON.stringify(eigen) === JSON.stringify(lijst);
  (gelijk ? ok : fouten).push(`Gepubliceerd overzicht ${naam} ${gelijk ? 'komt overeen met de herberekening' : 'WIJKT AF van de herberekening'}`);
});

// 1. harde regel: niemand twee wedstrijden tegelijk; geen twee wedstrijden op dezelfde baan tegelijk
const perTijd = {};
items.forEach(i => { const k = i.t; (perTijd[k] = perTijd[k] || []).push(i); });
let dubbelBezet = 0, baanDubbel = 0;
Object.values(perTijd).forEach(lijst => {
  const gezien = new Set(), banen = new Set();
  lijst.forEach(i => { i.w.spelers.forEach(p => { if (gezien.has(p)) dubbelBezet++; gezien.add(p); }); if (banen.has(i.baan)) baanDubbel++; banen.add(i.baan); });
});
(dubbelBezet ? fouten : ok).push(`Speler op twee banen tegelijk: ${dubbelBezet}x`);
(baanDubbel ? fouten : ok).push(`Twee wedstrijden op dezelfde baan tegelijk: ${baanDubbel}x`);
const maxBaan = Math.max(...items.map(i => i.baan));
(maxBaan <= S.inst.banen ? ok : fouten).push(`Hoogste baannummer ${maxBaan} (ingesteld: ${S.inst.banen})`);

// 2. tijdvak
const eerste = Math.min(...items.map(i => i.t)), laatste = Math.max(...items.map(i => i.t)) + S.inst.duur;
const eindeDag = laatste + S.inst.prijsuitreiking;
(eerste >= toMin(S.inst.start) ? ok : fouten).push(`Eerste wedstrijd ${E.toTijd(eerste)} (start ${S.inst.start})`);
(eindeDag <= toMin(S.inst.eind) ? ok : fouten).push(`Laatste wedstrijd klaar ${E.toTijd(laatste)}, met prijsuitreiking ${E.toTijd(eindeDag)} (uiterlijk ${S.inst.eind})`);
const tijden = [...new Set(items.map(i => i.t))].sort((a, b) => a - b);
const scheef = tijden.filter(t => (t - toMin(S.inst.start)) % slotLen !== 0);
(scheef.length ? fouten : ok).push(`Alle aanvangstijden op het ritme van ${slotLen} min: ${scheef.length ? 'nee' : 'ja'}`);

// 3. rust: maximaal 2 achter elkaar
const perSpeler = {};
items.forEach(i => i.w.spelers.forEach(p => (perSpeler[p] = perSpeler[p] || []).push(i)));
let overschr = [], achter = 0, achterWissel = 0;
const stat = [];
Object.entries(perSpeler).forEach(([p, l]) => {
  l.sort((a, b) => a.t - b.t);
  let reeks = 1, max = 1, maxWacht = 0;
  for (let k = 1; k < l.length; k++) {
    if (l[k].t - l[k - 1].t === slotLen) { reeks++; achter++; if (l[k].baan !== l[k - 1].baan) achterWissel++; } else { reeks = 1; maxWacht = Math.max(maxWacht, l[k].t - l[k - 1].t - S.inst.duur); }
    max = Math.max(max, reeks);
  }
  if (max > S.inst.maxAchterElkaar) overschr.push(`${naarNaam(p)} (${max})`);
  stat.push({ naam: naarNaam(p), n: l.length, eerste: l[0].t, laatste: l[l.length - 1].t, span: l[l.length - 1].t - l[0].t, maxWacht });
});
(overschr.length ? letop : ok).push(`Meer dan ${S.inst.maxAchterElkaar} wedstrijden achter elkaar: ${overschr.join(', ') || 'niemand'}`);
ok.push(`Twee wedstrijden direct achter elkaar: ${achter}x, waarvan ${achterWissel}x met baanwissel`);

// 4. poules compleet: iedereen precies één keer tegen iedereen
R.groepen.filter(g => g.soort === 'poule').forEach(g => {
  const ws = R.wedstrijden.filter(w => w.groep === g.id);
  const n = g.units.length, verwacht = n * (n - 1) / 2;
  const paren = new Set(ws.map(w => [w.a.id, w.b.id].sort().join('|')));
  const allesGepland = ws.every(w => items.some(i => i.w === w));
  const klopt = ws.length === verwacht && paren.size === verwacht && allesGepland;
  (klopt ? ok : fouten).push(`${g.d} ${g.label}: ${n} deelnemers, ${ws.length} van ${verwacht} wedstrijden${allesGepland ? '' : ', NIET ALLES GEPLAND'}`);
  if (n < S.inst.minPoule) letop.push(`${g.d} ${g.label} heeft maar ${n} deelnemers (minimaal ${S.inst.minPoule})`);
  if (n > S.inst.maxPoule) fouten.push(`${g.d} ${g.label} heeft ${n} deelnemers (maximaal ${S.inst.maxPoule})`);
});

// 5. inschrijvingen: speelt iedereen wat hij opgaf, en niets anders?
const onderdelenVan = p => [p.E && (p.sexe === 'H' ? 'HE' : 'DE'), p.D && (p.sexe === 'H' ? 'HD' : 'DD'), p.G && 'GD'].filter(Boolean);
spelers.forEach(p => {
  const gespeeld = new Set((perSpeler[p.id] || []).map(i => i.w.d));
  onderdelenVan(p).forEach(d => { if (!gespeeld.has(d)) fouten.push(`${p.naam} schreef zich in voor ${d} maar speelt daar niet`); });
  [...gespeeld].forEach(d => { if (!onderdelenVan(p).includes(d)) letop.push(`${p.naam} speelt ${d} zonder zich daarvoor te hebben ingeschreven (handmatig gekoppeld)`); });
  if (!onderdelenVan(p).length && gespeeld.size) fouten.push(`${p.naam} speelt terwijl hij/zij alleen voor de bbq kwam`);
});

// 6. partners: geslacht, wederzijdse opgave, ieder in maximaal één koppel
['HD', 'DD', 'GD'].forEach(d => {
  const koppels = R.partnerInfo[d].koppels, gezien = new Set();
  koppels.forEach(k => {
    const a = by[k.a], b = by[k.b];
    const geslachtOk = d === 'GD' ? a.sexe !== b.sexe : (a.sexe === b.sexe && a.sexe === (d === 'HD' ? 'H' : 'D'));
    if (!geslachtOk) fouten.push(`${d}: koppel ${a.naam} / ${b.naam} heeft de verkeerde samenstelling`);
    [a, b].forEach(x => { if (gezien.has(x.id)) fouten.push(`${d}: ${x.naam} zit in twee koppels`); gezien.add(x.id); });
    const opg = x => d === 'GD' ? (x.gHeeft ? x.gNaam : null) : (x.dHeeft ? x.dNaam : null);
    const noemt = (x, y) => { const t = E.norm(opg(x) || ''); return t && (t === E.norm(y.naam) || t === E.norm(y.vn) || E.norm(y.naam).startsWith(t)); };
    const beschrijving = `${a.naam} / ${b.naam} (${k.soort})`;
    if (k.soort === 'opgegeven') {
      const wederzijds = noemt(a, b) && noemt(b, a);
      (wederzijds ? ok : letop).push(`${d}: ${beschrijving}: ${wederzijds ? 'noemen elkaar' : `opgave: ${a.vn} → "${opg(a) || 'zoekt'}", ${b.vn} → "${opg(b) || 'zoekt'}"`}`);
    } else letop.push(`${d}: ${beschrijving}, niveau ${S.niveaus[k.a] || 3} + ${S.niveaus[k.b] || 3}`);
  });
  R.partnerInfo[d].over.forEach(id => letop.push(`${d}: ${naarNaam(id)} heeft geen partner`));
});

// 7. klassen: volgorde op niveau en alleen naburige verschuivingen
const KN = ['A', 'B', 'C', 'D'];
Object.entries(R.indeling).forEach(([d, ind]) => {
  const gem = ind.klassen.map(k => k.units.length ? k.units.reduce((a, u) => a + u.niveau, 0) / k.units.length : null);
  const reeks = gem.filter(x => x != null);
  const dalend = reeks.every((x, i) => i === 0 || x <= reeks[i - 1]);
  (dalend ? ok : letop).push(`${d}: gemiddeld niveau per klasse ${ind.klassen.map((k, i) => `${k.naam}=${gem[i] == null ? '-' : gem[i].toFixed(2)} (${k.units.length})`).join(', ')}`);
  ind.klassen.forEach((k, i) => k.units.forEach(u => {
    const sprong = Math.abs(i - u.klasseAuto);
    if (sprong > 1) fouten.push(`${d}: ${u.naam} is ${sprong} klassen verschoven (alleen naburig is toegestaan)`);
    else if (sprong === 1) letop.push(`${d}: ${u.naam} (niveau ${u.niveau}) handmatig van ${KN[u.klasseAuto]} naar ${k.naam}`);
  }));
  ind.problemen.forEach(p => letop.push(`${d}: openstaand: ${p.tekst}`));
});

// 8. belasting en spreiding per speler
stat.sort((a, b) => b.n - a.n);
const gemN = stat.reduce((a, s) => a + s.n, 0) / stat.length;
console.log('=== FOUTEN (' + fouten.length + ')'); fouten.forEach(x => console.log(' -', x));
console.log('=== LET OP (' + letop.length + ')'); letop.forEach(x => console.log(' -', x));
console.log('=== IN ORDE (' + ok.length + ')'); ok.forEach(x => console.log(' -', x));
console.log('=== BELASTING (gemiddeld ' + gemN.toFixed(1) + ' wedstrijden)');
stat.forEach(s => console.log(` ${s.naam.padEnd(20)} ${String(s.n).padStart(2)} wedstr. ${E.toTijd(s.eerste)}-${E.toTijd(s.laatste)}  langste wachttijd ${s.maxWacht} min`));
console.log('totaal wedstrijden', items.length, 'banen gebruikt', maxBaan, 'gespreid', R.planning.gespreid);
console.log('=== STAPPEN');
['HD','DD','GD'].forEach(d=>{const i=R.partnerInfo[d];console.log(d,'voorstellen:',i.voorstellen.map(v=>v.reden).join('; ')||'-','| zonder partner:',i.over.map(naarNaam).join(', ')||'-','| auto:',i.koppels.filter(k=>k.soort==='automatisch').map(k=>naarNaam(k.a)+'/'+naarNaam(k.b)).join(', '));});
Object.entries(R.indeling).forEach(([d,ind])=>ind.problemen.forEach(p=>console.log('KLASSE',p.tekst)));
R.meldingen.filter(m=>m.niveau!=='info').forEach(m=>console.log('MELDING',m.niveau,m.tekst));
R.groepen.forEach(g=>console.log('GROEP',g.d,g.label,g.units.map(u=>u.naam+'('+u.niveau+')').join(', ')));
