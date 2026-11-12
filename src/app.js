(() => {
const E = ENGINE;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kloon = o => JSON.parse(JSON.stringify(o));
const NIVEAU_UITLEG = { 1: 'recreatief', 2: 'licht gevorderd', 3: 'gemiddeld', 4: 'gevorderd', 5: 'sterk' };
const SPELERS_LINK = 'https://claude.ai/artifact/K1koGcyh4Eke5BcqWUMcph#speler';

// ---------- toestand ----------
const leegNa = () => ({ vervallen: {}, vervang: [], herplannen: false, nietIndelen: {}, besluiten: [] });
const leegBesl = () => ({ partners: {}, klasse: {}, handKoppels: {}, gezien: {}, verstuurd: {}, afgemeld: {}, bekend: {}, na: leegNa() });
let S = { inst: kloon(E.STANDAARD), niveaus: { ...VOORBEELD.niveaus }, besl: leegBesl(), voorbeeldNiveaus: true,
  comm: { afzender: 'De toernooicommissie', onderwerp: '', tekst: '', groep: 'iedereen' } };
let ruweSpelers = E.leesTally(VOORBEELD.payload); // zoals ingeschreven in Tally
let spelers = ruweSpelers;                          // na verwerking van afmeldingen
let bron = { soort: 'voorbeeld', tijd: null };
let R = null, alternatieven = [];
let stap = 'controle', filterSpeler = '', zoekSpeler = '';
let magSchrijven = true;          // false voor kijkers zonder schrijfrecht: alleen de spelersweergave
let gepubliceerd = null;          // gepubliceerd spelersoverzicht uit de opslag
let gekozenSpeler = '';
try { gekozenSpeler = localStorage.getItem('toernooi-speler') || ''; } catch (e) {}

function vulAan(inst) {
  const s = kloon(E.STANDAARD);
  Object.assign(s, inst || {});
  s.onderdelen = kloon(E.STANDAARD.onderdelen);
  Object.entries((inst && inst.onderdelen) || {}).forEach(([d, o]) => { s.onderdelen[d] = { ...s.onderdelen[d], ...o }; });
  if (s.eindModus === 'auto') s.eindModus = 'start';
  if (s.eindModus === 'vast') s.eindModus = 'venster';
  return s;
}

// ---------- opslag ----------
let db = null, opslagTimer = null;
const DOC = 'toernooi/staat', PUB = 'toernooi/spelersoverzicht';
function zetOpslag(t) { const el = $('#opslag'); if (el) el.textContent = t; }
function bewaar() {
  if (!magSchrijven) return;
  clearTimeout(opslagTimer);
  opslagTimer = setTimeout(async () => {
    const data = { inst: S.inst, niveaus: S.niveaus, besl: S.besl, comm: S.comm, voorbeeldNiveaus: !!S.voorbeeldNiveaus, bijgewerkt: new Date().toISOString() };
    if (db) {
      try { zetOpslag('Opslaan…'); await db.doc(DOC).set(data); zetOpslag('Opgeslagen'); return; }
      catch (e) { zetOpslag('Opslaan mislukt, alleen in deze browser bewaard'); }
    }
    try { localStorage.setItem('toernooiplanner', JSON.stringify(data)); if (!db) zetOpslag('Alleen in deze browser bewaard'); } catch (e) { if (!db) zetOpslag('Wordt niet bewaard'); }
  }, 700);
}
function laadLokaal() { try { const t = localStorage.getItem('toernooiplanner'); if (t) return JSON.parse(t); } catch (e) {} return null; }
function pasToe(bron) {
  if (!bron) return;
  // gegevens uit de opslag zijn bevroren (alleen-lezen): eerst een bewerkbare kopie maken
  const data = kloon(bron);
  S.inst = vulAan(data.inst);
  S.niveaus = data.niveaus || {};
  S.besl = { ...leegBesl(), ...(data.besl || {}) };
  S.besl.na = { ...leegNa(), ...((data.besl && data.besl.na) || {}) };
  S.comm = { ...S.comm, ...(data.comm || {}) };
  S.voorbeeldNiveaus = !!data.voorbeeldNiveaus;
}

// ---------- Tally ----------
let mcp = null;
async function haalOp(handmatig) {
  const knop = $('#ophalen');
  if (!mcp) { $('#bronTekst').textContent = 'Voorbeeldgegevens (geen verbinding met Tally in deze weergave)'; return; }
  knop.disabled = true; $('#bronTekst').textContent = 'Inschrijvingen ophalen…';
  try {
    const res = await mcp.callTool('Tally', 'fetch_submissions', { formId: S.inst.tallyForm, limit: 500 }, { cache: handmatig ? { refresh: true, staleTime: 0, gcTime: 300000 } : undefined });
    let payload = res.payload;
    if (typeof payload === 'string') { const i = payload.indexOf('{'); try { payload = JSON.parse(payload.slice(i)); } catch (e) {} }
    const nieuw = E.leesTally(payload);
    if (!nieuw.length) throw { code: 'leeg' };
    ruweSpelers = nieuw;
    bron = { soort: 'tally', tijd: res.cache ? res.cache.storedAt : Date.now() };
    $('#bronTekst').textContent = `Tally-formulier ${S.inst.tallyForm}: ${spelers.length} inschrijvingen, opgehaald ${new Date(bron.tijd).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
    herbereken();
  } catch (e) {
    const code = e && e.code;
    const uitleg = {
      needs_reauth: 'De Tally-koppeling is verlopen. Koppel Tally opnieuw via claude.ai, Instellingen, Connectors.',
      server_not_connected: 'Tally is niet gekoppeld. Voeg Tally toe via claude.ai, Instellingen, Connectors.',
      approval_required: 'Deze pagina heeft toestemming nodig om Tally te lezen. Klik nogmaals op de knop en kies Toestaan.',
      not_in_manifest: 'Tally lezen is voor deze pagina niet toegestaan.',
      blocked_by_policy: 'Je organisatie staat Tally voor deze pagina niet toe.',
      tool_error: 'Tally gaf een fout terug. Controleer het formulier-ID bij Instellingen.',
      leeg: 'Het formulier heeft nog geen inschrijvingen.',
    }[code] || 'Tally was niet bereikbaar. Probeer het straks opnieuw.';
    $('#bronTekst').textContent = (bron.soort === 'tally' ? 'Laatst opgehaalde gegevens. ' : 'Voorbeeldgegevens. ') + uitleg;
  } finally { knop.disabled = false; }
}

// ---------- rekenen ----------
// afmeldingen per onderdeel (E, D, G) en voor de bbq; de inschrijving in Tally blijft ongewijzigd
function effectief(lijst) {
  return lijst.map(p => {
    const a = S.besl.afgemeld[p.id] || {}, ni = (S.besl.na && S.besl.na.nietIndelen) || {};
    const niet = v => Object.keys(ni).some(k => k.startsWith(p.id + '|') && ni[k] && { HE: 'E', DE: 'E', HD: 'D', DD: 'D', GD: 'G' }[k.split('|')[1]] === v);
    return { ...p, E: p.E && !a.E && !niet('E'), D: p.D && !a.D && !niet('D'), G: p.G && !a.G && !niet('G'), eet: p.eet && !a.bbq, afgemeld: a };
  });
}
const vingerafdruk = p => JSON.stringify([p.sexe, p.E, p.D, p.G, p.dHeeft, p.dNaam, p.gHeeft, p.gNaam, p.eet, p.dieet, p.email]);
function wijzigingen() {
  const bekend = S.besl.bekend || {};
  if (!Object.keys(bekend).length) return null; // nog geen startpunt vastgelegd
  const nieuw = [], gewijzigd = [], weg = [];
  ruweSpelers.forEach(p => { if (!(p.id in bekend)) nieuw.push(p); else if (bekend[p.id] !== vingerafdruk(p)) gewijzigd.push(p); });
  Object.keys(bekend).forEach(id => { if (!ruweSpelers.some(p => p.id === id)) weg.push(id); });
  return { nieuw, gewijzigd, weg };
}
function herbereken() {
  spelers = effectief(ruweSpelers);
  R = E.volledig(spelers, S.niveaus, S.inst, S.besl);
  alternatieven = [];
  const probeer = (label, wijzig) => {
    const r = E.volledig(spelers, S.niveaus, { ...kloon(S.inst), ...wijzig }, S.besl);
    alternatieven.push({ label, einde: r.analyse.eindeSpel, start: r.start });
  };
  if (S.inst.banen < 7) probeer(`met ${S.inst.banen + 1} banen`, { banen: S.inst.banen + 1 });
  if (S.inst.banen > 1) probeer(`met ${S.inst.banen - 1} banen`, { banen: S.inst.banen - 1 });
  if (S.inst.duur > 8) probeer(`met wedstrijden van ${S.inst.duur - 2} minuten`, { duur: S.inst.duur - 2 });
  render();
}

// ---------- afgeleide lijsten ----------
const naam = id => (R.byId[id] ? R.byId[id].naam : id);
const speler = id => R.byId[id];
const DUBBEL = ['HD', 'DD', 'GD'];
const actiefD = d => S.inst.onderdelen[d] && S.inst.onderdelen[d].actief;
function controlePunten() {
  const punten = [];
  DUBBEL.filter(actiefD).forEach(d => {
    R.partnerInfo[d].voorstellen.forEach(v => punten.push({ soort: 'voorstel', d, v, open: v.status === 'open' }));
    R.partnerInfo[d].meldingen.filter(m => m.soort === 'partneropgave').forEach(m => {
      const key = `${d}|${m.speler}|opgave`;
      punten.push({ soort: 'opgave', d, m, key, open: !S.besl.gezien[key] });
    });
  });
  spelers.forEach(p => {
    if (!p.email || !/@/.test(p.email)) punten.push({ soort: 'email', p, open: !S.besl.gezien[`email|${p.id}`], key: `email|${p.id}` });
    if (!p.E && !p.D && !p.G && !p.eet && !Object.keys(p.afgemeld || {}).length) punten.push({ soort: 'niets', p, open: !S.besl.gezien[`niets|${p.id}`], key: `niets|${p.id}` });
  });
  return punten;
}
function zonderPartner() {
  const lijst = [];
  DUBBEL.filter(actiefD).forEach(d => R.partnerInfo[d].over.forEach(id => lijst.push({ d, id, key: `geenpartner|${d}|${id}` })));
  return lijst;
}
const verstuurd = key => S.besl.verstuurd[key];

// ---------- stappen ----------
const STAPPEN = [
  { k: 'controle', t: 'Inschrijvingen', status: () => { const w = wijzigingen(); const nw = w ? w.nieuw.length + w.gewijzigd.length + w.weg.length : 0; const n = controlePunten().filter(x => x.open).length; return nw ? `${nw} nieuw of gewijzigd` : n ? `${n} te controleren` : null; } },
  { k: 'partners', t: 'Partners koppelen', status: () => { const n = zonderPartner().filter(x => !verstuurd(x.key)).length; return n ? `${n} zonder partner` : null; } },
  { k: 'niveaus', t: 'Niveaus', status: () => { const n = spelers.filter(p => (p.E || p.D || p.G) && S.niveaus[p.id] == null).length; return n ? `${n} zonder niveau` : null; } },
  { k: 'klassen', t: 'Klassen & poules', status: () => { const n = Object.values(R.indeling).reduce((a, i) => a + i.problemen.length, 0); return n ? `${n} klassen aanpassen` : null; } },
  { k: 'planning', t: 'Planning', status: () => { const ow = openWijzigingen(); if (ow && ow.aantal) return `${ow.aantal} wijziging${ow.aantal > 1 ? 'en' : ''} te beslissen`; const n = liveModus() ? R.meldingen.filter(m => m.niveau === 'probleem' && m.soort !== 'geenpartner').length : 0; if (n) return `${n} probleem${n > 1 ? 'en' : ''}`; return gepubliceerd && gepubliceerd.handtekening === handtekening() ? null : 'nog publiceren'; } },
  { k: 'communicatie', t: 'Communicatie', status: () => { const lijst = toon(); const met = spelers.filter(p => overzichtVan(p.id, lijst).length); const n = met.filter(p => verstuurd(`overzicht|${p.id}`)).length; return n < met.length ? `${n} van ${met.length} overzichten verstuurd` : null; } },
];
const EXTRA = [['instellingen', 'Instellingen'], ['bbq', 'BBQ'], ['speler', 'Spelersweergave']];

function render() {
  if (stap === 'speler' || !magSchrijven) { renderSpelerModus(); return; }
  $('#bronbalk').hidden = false; $('#tegels').hidden = false;
  $('#titel').textContent = 'Toernooiplanner clubkampioenschappen';
  renderTegels(); renderStappen();
  const f = { controle: rControle, partners: rPartners, niveaus: rNiveaus, klassen: rKlassen, planning: rPlanning, communicatie: rCommunicatie, instellingen: rInstellingen, bbq: rBbq }[stap] || rControle;
  $('#inhoud').innerHTML = f();
  if (stap === 'instellingen') koppelInstellingen();
}
function renderTegels() {
  const lijst = toon(), live = liveModus(), einde = eindeVan(lijst);
  const deelnemers = new Set(lijst.filter(w => !w.vervallen).flatMap(echteSpelers)).size;
  const begin = live ? R.start : (lijst.length ? E.toTijd(Math.min(...lijst.map(w => w.t))) : S.inst.start);
  const eindeDag = einde ? einde + S.inst.prijsuitreiking : null;
  const venster = R.modus === 'venster';
  $('#tegels').innerHTML = `
    <div class="tegel"><b>${deelnemers}</b><span>spelers met wedstrijden</span></div>
    <div class="tegel"><b>${lijst.filter(w => !w.vervallen).length}</b><span>wedstrijden${live ? '' : ' (vastgezet)'}</span></div>
    <div class="tegel"><b>${esc(begin)}</b><span>${live && R.modus === 'eind' ? 'berekende begintijd' : 'begintijd'}</span></div>
    <div class="tegel"><b>${einde ? E.toTijd(einde) : '-'}</b><span>laatste wedstrijd klaar</span></div>
    <div class="tegel ${venster && eindeDag && eindeDag > E.toMin(S.inst.eind) ? 'probleem' : ''}"><b>${eindeDag ? E.toTijd(eindeDag) : '-'}</b><span>${venster ? `einde dag (uiterlijk ${esc(S.inst.eind)})` : 'na prijsuitreiking'}</span></div>`;
}
function renderStappen() {
  const html = STAPPEN.map((s, i) => {
    const st = s.status();
    return `<button type="button" data-stap="${s.k}" class="${st ? 'open' : 'klaar'}" ${stap === s.k ? 'aria-current="step"' : ''}><span class="nr">${st ? i + 1 : '✓'}</span><span class="tt">${s.t}</span><span class="st">${esc(st || 'klaar')}</span></button>`;
  }).join('') + '<span class="scheiding" aria-hidden="true"></span>' +
    EXTRA.map(([k, t]) => `<button type="button" class="extra" data-stap="${k}" ${stap === k ? 'aria-current="step"' : ''}><span class="tt">${t}</span></button>`).join('');
  $('#stappen').innerHTML = html;
}
function stapKop(titel, uitleg, rechts) {
  return `<div class="stapkop"><div><h2>${titel}</h2>${uitleg ? `<p class="zacht klein">${uitleg}</p>` : ''}</div>${rechts || ''}</div>`;
}
function volgende(k) {
  const i = STAPPEN.findIndex(s => s.k === k);
  const n = STAPPEN[i + 1];
  return n ? `<div class="volgende"><button class="knop primair" type="button" data-stap="${n.k}">Verder naar ${n.t.toLowerCase()} →</button></div>` : '';
}
const odChip = d => `<span class="chip od od-${d}">${E.ONDERDELEN[d].kort}</span>`;
const groepVan = id => R.groepen.find(g => g.id === id);
function rMeldingen(lijst) {
  if (!lijst.length) return '<p class="zacht">Geen meldingen.</p>';
  const orde = { probleem: 0, 'let-op': 1, info: 2 };
  return [...lijst].sort((a, b) => orde[a.niveau] - orde[b.niveau]).map(m => `<div class="melding ${m.niveau}"><div>${m.d ? odChip(m.d) + ' ' : ''}${esc(m.tekst)}</div></div>`).join('');
}

// ---------- stap 1: inschrijvingen ----------
function rControle() {
  const punten = controlePunten();
  const open = punten.filter(x => x.open), klaar = punten.filter(x => !x.open);
  const kaart = x => {
    if (x.soort === 'voorstel') {
      const v = x.v;
      return `<div class="voorstel"><div>${odChip(x.d)} <b>${esc(naam(v.van))}</b>: ${esc(v.reden)}. Bedoeld is waarschijnlijk <b>${esc(naam(v.naar))}</b>.</div>
        <div class="rij">${v.status === 'open' ? '<span class="chip letop">nog bevestigen</span>' : v.status === 'ok' ? '<span class="chip goed">bevestigd</span>' : '<span class="chip fout">afgewezen</span>'}
        <button class="knop klein" type="button" data-partner="${esc(v.key)}" data-keuze="ok">Klopt</button>
        <button class="knop klein" type="button" data-partner="${esc(v.key)}" data-keuze="afwijzen">Klopt niet</button></div></div>`;
    }
    const tekst = x.soort === 'opgave' ? x.m.tekst : x.soort === 'email' ? `${x.p.naam} heeft geen geldig e-mailadres opgegeven ("${x.p.email || 'leeg'}").` : `${x.p.naam} doet aan geen enkel onderdeel mee en eet ook niet mee.`;
    const d = x.d ? odChip(x.d) + ' ' : '';
    const vervolg = x.soort === 'opgave' ? 'Zonder actie komt deze speler bij de partnerzoekers (stap 2).' : '';
    return `<div class="voorstel"><div>${d}${esc(tekst)}</div>${vervolg ? `<div class="klein zacht">${vervolg}</div>` : ''}
      <div class="rij">${x.open ? '<span class="chip letop">open</span>' : '<span class="chip goed">gezien</span>'}<button class="knop klein" type="button" data-gezien="${esc(x.key)}">${x.open ? 'Gezien, akkoord' : 'Weer openzetten'}</button></div></div>`;
  };
  const odVan = p => [p.E && ['E', p.sexe === 'H' ? 'HE' : 'DE'], p.D && ['D', p.sexe === 'H' ? 'HD' : 'DD'], p.G && ['G', 'GD']].filter(Boolean);
  const rij = p => {
    const a = S.besl.afgemeld[p.id] || {};
    const chips = odVan(p).map(([k, d]) => `<button type="button" class="chip od od-${d} afmeldknop ${a[k] ? 'afgemeld' : ''}" data-afmeld="${esc(p.id + '|' + k)}" aria-pressed="${!!a[k]}" title="${a[k] ? 'Afgemeld. Tik om weer aan te melden.' : 'Tik om af te melden voor dit onderdeel'}">${E.ONDERDELEN[d].kort}</button>`).join('');
    const bbq = p.eet ? `<button type="button" class="chip afmeldknop ${a.bbq ? 'afgemeld' : ''}" data-afmeld="${esc(p.id + '|bbq')}" aria-pressed="${!!a.bbq}" title="${a.bbq ? 'Afgemeld voor de bbq. Tik om ongedaan te maken.' : 'Tik om af te melden voor de bbq'}">bbq</button>` : '';
    const partner = [p.D ? `dubbel: ${p.dHeeft ? esc(p.dNaam || '?') : 'zoekt'}` : '', p.G ? `gemengd: ${p.gHeeft ? esc(p.gNaam || '?') : 'zoekt'}` : ''].filter(Boolean).join('<br>');
    const iets = Object.values(a).some(Boolean);
    return `<tr><td>${esc(p.naam)}${iets ? ' <span class="chip fout">afmelding</span>' : ''}</td><td class="klein">${esc(p.email)}</td><td><span class="rij" style="gap:4px">${chips || '<span class="zacht klein">geen onderdelen</span>'}${bbq}</span></td><td class="klein">${partner}</td><td class="klein">${p.eet ? (a.bbq ? 'afgemeld' : 'ja' + (p.dieet && !['geen', '-'].includes(E.norm(p.dieet)) ? ', ' + esc(p.dieet) : '')) : 'nee'}</td></tr>`;
  };
  const w = wijzigingen();
  const ondTekst = p => odVan(p).map(([, d]) => E.ONDERDELEN[d].kort).join(', ') || 'alleen bbq';
  let wijzigBlok;
  if (!w) {
    wijzigBlok = `<p class="klein">Leg vast welke inschrijvingen je hebt gecontroleerd. Daarna ziet de tool bij elke controle welke aanmeldingen er nieuw of gewijzigd zijn.</p>
      <div class="rij"><button class="knop primair klein" type="button" id="startpunt">${ruweSpelers.length} inschrijvingen vastleggen als gecontroleerd</button></div>`;
  } else if (!w.nieuw.length && !w.gewijzigd.length && !w.weg.length) {
    wijzigBlok = `<p class="klein"><span class="chip goed">geen nieuwe aanmeldingen</span> Sinds je laatste controle is er niets veranderd in Tally.</p>`;
  } else {
    const r = (p, soort) => `<div class="voorstel"><div><span class="chip ${soort === 'nieuw' ? 'letop' : soort === 'weg' ? 'fout' : ''}">${soort === 'nieuw' ? 'nieuw' : soort === 'weg' ? 'niet meer in Tally' : 'gewijzigd'}</span> <b>${esc(p.naam || p)}</b>${p.naam ? ` · ${esc(ondTekst(p))}${p.D ? ` · dubbel: ${p.dHeeft ? esc(p.dNaam) : 'zoekt partner'}` : ''}${p.G ? ` · gemengd: ${p.gHeeft ? esc(p.gNaam) : 'zoekt partner'}` : ''}` : ''}</div>
      <div class="rij"><button class="knop klein" type="button" data-verwerkt="${esc(p.id || p)}">Verwerkt</button></div></div>`;
    wijzigBlok = `<p class="klein zacht">Controleer deze aanmeldingen: ze tellen al mee in de koppels en de planning. Vergeet daarna niet opnieuw te publiceren.</p>
      <div class="stapel">${w.nieuw.map(p => r(p, 'nieuw')).join('')}${w.gewijzigd.map(p => r(p, 'gewijzigd')).join('')}${w.weg.map(id => r(id, 'weg')).join('')}</div>
      <div class="rij"><button class="knop klein" type="button" id="startpunt">Alles verwerkt</button></div>`;
  }
  return `<div class="stapel">
    <div class="paneel stapel">${stapKop('1. Inschrijvingen controleren', 'Controleer nieuwe aanmeldingen en wat er bij het inschrijven mis kan zijn gegaan: partnernamen die niet precies kloppen, partners die niet zijn ingeschreven en ontbrekende gegevens. Wat hier niet klopt, gaat door naar de partnerzoekers in stap 2.',
      `<button class="knop klein" type="button" id="ophalen2">Inschrijvingen opnieuw ophalen</button>`)}
      <h3>Nieuwe en gewijzigde aanmeldingen</h3>${wijzigBlok}
      <h3>Te controleren</h3>
      ${open.length ? `<div class="stapel">${open.map(kaart).join('')}</div>` : '<p><span class="chip goed">Alles gecontroleerd</span></p>'}
      ${klaar.length ? `<details><summary class="klein zacht">${klaar.length} afgehandeld</summary><div class="stapel" style="margin-top:8px">${klaar.map(kaart).join('')}</div></details>` : ''}
    </div>
    <div class="paneel stapel"><h3>Alle inschrijvingen (${ruweSpelers.length})</h3>
      <p class="klein zacht">Afmelden: tik op een onderdeel of op "bbq" om iemand daarvoor af te melden. Nog een keer tikken maakt het ongedaan. De inschrijving in Tally blijft staan. Een dubbelpartner van iemand die zich afmeldt, komt bij de partnerzoekers in stap 2.</p>
      <div class="tabel-box"><table class="lijst"><thead><tr><th>Naam</th><th>E-mail</th><th>Onderdelen</th><th>Partneropgave</th><th>BBQ</th></tr></thead><tbody>${[...ruweSpelers].sort((a, b) => a.naam.localeCompare(b.naam)).map(rij).join('')}</tbody></table></div></div>
    ${volgende('controle')}</div>`;
}

// ---------- stap 2: partners ----------
function kandidatenVoor(d, id) {
  const p = speler(id), od = E.ONDERDELEN[d];
  // vaste koppels (opgegeven of handmatig) blijven heel; door de tool gekoppelde zoekers mogen opnieuw ingedeeld worden
  const inKoppel = new Set(R.partnerInfo[d].koppels.filter(k => k.soort !== 'automatisch').flatMap(k => [k.a, k.b]));
  const autoPartner = {}; R.partnerInfo[d].koppels.filter(k => k.soort === 'automatisch').forEach(k => { autoPartner[k.a] = k.b; autoPartner[k.b] = k.a; });
  // alleen spelers die zich zelf voor dit onderdeel inschreven (wie zich niet inschreef, koos daar bewust voor)
  return spelers.filter(q => q.id !== id && !inKoppel.has(q.id) && (od.veld === 'D' ? q.D : q.G) && (od.type === 'gemengd' ? q.sexe !== p.sexe : q.sexe === p.sexe))
    .map(q => ({ q, nu: autoPartner[q.id] }))
    .sort((a, b) => Math.abs((S.niveaus[a.q.id] || 3) - (S.niveaus[id] || 3)) - Math.abs((S.niveaus[b.q.id] || 3) - (S.niveaus[id] || 3)));
}
function rPartners() {
  const zp = zonderPartner();
  const blokken = DUBBEL.filter(actiefD).map(d => {
    const info = R.partnerInfo[d];
    const soort = { opgegeven: '<span class="chip goed">opgegeven</span>', automatisch: '<span class="chip letop">gekoppeld door de tool</span>', handmatig: '<span class="chip">handmatig gekoppeld</span>' };
    const kop = info.koppels.map(k => `<tr><td>${esc(naam(k.a))} / ${esc(naam(k.b))}</td><td class="num">${((S.niveaus[k.a] || 3) + (S.niveaus[k.b] || 3)) / 2}</td><td>${soort[k.soort] || ''}</td>
      <td>${k.soort === 'handmatig' ? `<button class="knop klein" type="button" data-ontkoppel="${esc(d + '|' + k.a + '|' + k.b)}">Ontkoppelen</button>` : ''}</td></tr>`).join('');
    const over = info.over.map(id => {
      const p = speler(id), key = `geenpartner|${d}|${id}`, kand = kandidatenVoor(d, id);
      const opties = kand.map(({ q, nu }) => `<option value="${esc(q.id)}">${esc(q.naam)} (niveau ${S.niveaus[q.id] || 3}${nu ? ', nu door de tool gekoppeld aan ' + esc(naam(nu)) : ''})</option>`).join('');
      const m = mailGeenPartner(p, d);
      return `<div class="voorstel"><div><b>${esc(p.naam)}</b> heeft geen partner voor ${E.ONDERDELEN[d].naam.toLowerCase()} (niveau ${S.niveaus[id] || 3}).</div>
        ${kand.length ? `<div class="koppel-kies"><label for="kies-${esc(d + id)}" class="klein">Koppel aan een andere partnerzoeker</label><select id="kies-${esc(d + id)}"><option value="">Kies een speler…</option>${opties}</select>
          <button class="knop klein" type="button" data-koppel="${esc(d + '|' + id)}" data-select="kies-${esc(d + id)}">Koppelen</button></div>` : '<div class="klein zacht">Er is geen andere partnerzoeker voor dit onderdeel. Spelers die zich niet voor dit onderdeel inschreven, worden niet gekoppeld.</div>'}
        <div class="klein zacht">Laat het de speler weten:</div>${mailKaart(m, key)}</div>`;
    }).join('');
    return `<div class="paneel stapel"><h3>${odChip(d)} ${E.ONDERDELEN[d].naam}</h3>
      ${info.meldingen.filter(m => m.soort === 'handkoppel').length ? rMeldingen(info.meldingen.filter(m => m.soort === 'handkoppel')) : ''}
      ${over ? `<div class="stapel">${over}</div>` : ''}
      <div class="tabel-box"><table class="lijst"><thead><tr><th>Koppel</th><th>Niveau</th><th>Hoe</th><th></th></tr></thead><tbody>${kop || '<tr><td colspan="4" class="zacht">Nog geen koppels.</td></tr>'}</tbody></table></div></div>`;
  }).join('');
  return `<div class="stapel">
    <div class="paneel">${stapKop('2. Partners koppelen', 'Spelers die wel willen meedoen maar geen partner hebben, koppelt de tool aan elkaar op niveau. Controleer die koppels. Blijft er iemand over, koppel die dan zelf aan een andere partnerzoeker of stuur een mail. Wie zich niet voor een onderdeel inschreef, wordt daar niet aan gekoppeld.')}
      <p class="klein">${zp.length ? `<span class="chip fout">${zp.length} zonder partner</span>` : '<span class="chip goed">Iedereen heeft een partner</span>'} ${['HD', 'DD', 'GD'].filter(actiefD).map(d => { const n = R.partnerInfo[d].koppels.filter(k => k.soort === 'automatisch').length; return n ? `<span class="chip letop">${E.ONDERDELEN[d].kort}: ${n} door de tool gekoppeld</span>` : ''; }).join(' ')}</p></div>
    ${blokken}${volgende('partners')}</div>`;
}

// ---------- stap 3: niveaus ----------
function rNiveaus() {
  const lijst = spelers.filter(p => p.E || p.D || p.G).sort((a, b) => a.sexe.localeCompare(b.sexe) || a.naam.localeCompare(b.naam));
  const rij = p => {
    const niv = S.niveaus[p.id];
    const ond = [p.E && (p.sexe === 'H' ? 'HE' : 'DE'), p.D && (p.sexe === 'H' ? 'HD' : 'DD'), p.G && 'GD'].filter(Boolean);
    return `<tr><td>${esc(p.naam)}${niv == null ? ' <span class="chip letop">nog invullen</span>' : ''}</td><td>${p.sexe === 'H' ? 'Heer' : 'Dame'}</td><td><span class="rij" style="gap:4px">${ond.map(odChip).join('')}</span></td>
      <td><span class="niveaukeuze" role="group" aria-label="Niveau ${esc(p.naam)}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-niveau="${n}" data-speler="${esc(p.id)}" aria-pressed="${niv === n}" title="${NIVEAU_UITLEG[n]}">${n}</button>`).join('')}</span></td></tr>`;
  };
  return `<div class="stapel"><div class="paneel stapel">${stapKop('3. Niveaus', `Geef iedere speler een niveau van 1 (recreatief) tot 5 (sterk). Spelers zonder niveau tellen als 3. Een koppel krijgt het gemiddelde.${S.voorbeeldNiveaus ? ' <b>Bij de testinschrijvingen zijn voorbeeldniveaus ingevuld.</b>' : ''}`)}
    <div class="tabel-box"><table class="lijst"><thead><tr><th>Naam</th><th>Categorie</th><th>Onderdelen</th><th>Niveau</th></tr></thead><tbody>${lijst.map(rij).join('')}</tbody></table></div></div>
    ${volgende('niveaus')}</div>`;
}

// ---------- stap 4: klassen ----------
function rKlassen() {
  const blok = E.VOLGORDE.filter(d => actiefD(d) && R.indeling[d]).map(d => {
    const ind = R.indeling[d], K = ind.K, namen = E.KLASSEN[K];
    const probl = ind.problemen.map(p => `<div class="voorstel"><div><b>${esc(p.tekst)}</b></div>${p.opties.map(o => {
      const doel = namen[o.naar];
      const titel = o.soort === 'samenvoegen' ? `Samenvoegen: alle deelnemers naar ${doel}` : o.soort === 'aanvullen' ? `Aanvullen vanuit ${namen[o.van]}: naar ${doel}` : `${o.soort === 'omhoog' ? 'Omhoog' : 'Omlaag'} naar ${doel}`;
      return `<div><div class="klein" style="font-weight:600">${esc(titel)}</div><div class="rij" style="gap:6px;margin-top:4px">${o.units.map((u, ui) => `<button class="knop klein" type="button" data-klasse="${esc(d + '|' + u)}" data-naar="${o.naar}">${esc(o.namen[ui])} → ${doel}</button>`).join('')}
        ${o.units.length > 1 ? `<button class="knop klein primair" type="button" data-optie="${esc(JSON.stringify({ d, units: o.units, naar: o.naar }))}">Allemaal toepassen</button>` : ''}</div></div>`;
    }).join('')}</div>`).join('');
    const kol = ind.klassen.map((k, i) => `<div class="klasse"><h4><span>Klasse ${esc(k.naam)}</span><span class="zacht num">${k.units.length}</span></h4>${k.units.map(u => {
      const handmatig = S.besl.klasse[`${d}|${u.id}`] != null;
      return `<div class="unit"><span class="naam">${esc(u.naam)} <span class="zacht klein num">${u.niveau}</span>${handmatig ? ' <span class="chip letop">handmatig</span>' : ''}</span>
        <button class="pijl" type="button" aria-label="${esc(u.naam)} naar hogere klasse" data-klasse="${esc(d + '|' + u.id)}" data-naar="${i - 1}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="pijl" type="button" aria-label="${esc(u.naam)} naar lagere klasse" data-klasse="${esc(d + '|' + u.id)}" data-naar="${i + 1}" ${i === K - 1 ? 'disabled' : ''}>▼</button></div>`;
    }).join('') || '<p class="zacht klein">Leeg</p>'}</div>`).join('');
    const poules = R.groepen.filter(g => g.d === d).map(g => `<span class="chip">${esc(g.label)}: ${g.soort === 'finale' ? 'finales' : g.units.length + ' deelnemers'}</span>`).join(' ');
    return `<div class="paneel stapel"><div class="rij" style="justify-content:space-between"><h3>${odChip(d)} ${E.ONDERDELEN[d].naam}</h3>
      <button class="knop klein" type="button" data-reset="${d}">Terug naar automatische indeling</button></div>
      ${probl ? `<div class="stapel">${probl}</div>` : ''}<div class="klassen">${kol}</div>
      <div><div class="klein zacht" style="margin-bottom:4px">Zo wordt er gespeeld:</div><div class="rij" style="gap:6px">${poules || '<span class="zacht klein">Te weinig deelnemers.</span>'}</div></div></div>`;
  }).join('');
  return `<div class="stapel"><div class="paneel">${stapKop('4. Klassen & poules', 'De tool deelt elk onderdeel in op niveau. Is een klasse te klein of te groot, dan zie je een voorstel. Verschuiven gaat alleen naar een aangrenzende klasse.')}</div>${blok}${volgende('klassen')}</div>`;
}

// ---------- stap 5: planning ----------
// Tot publicatie wordt steeds opnieuw gepland ("live"). Na publicatie ligt de planning vast:
// wijzigingen (afmeldingen, nieuwe aanmeldingen) worden pas doorgevoerd na een keuze van de organisatie.
const ODVELD = { HE: 'E', DE: 'E', HD: 'D', DD: 'D', GD: 'G' };
const na = () => S.besl.na;
const liveModus = () => !(gepubliceerd && gepubliceerd.planning) || na().herplannen;

function liveWedstrijden() {
  const wById = Object.fromEntries(R.wedstrijden.map(w => [w.id, w]));
  const lijst = [];
  R.planning.slots.forEach((sl, s) => sl.forEach((id, baan) => {
    if (!id) return;
    const w = wById[id], g = groepVan(w.groep), t = R.analyse.tijden[s];
    lijst.push({ k: `${w.d}|${t}|${baan + 1}`, t, baan: baan + 1, d: w.d, label: g.label, titel: w.titel || '',
      a: { naam: w.a.naam, leden: [...w.a.leden] }, b: { naam: w.b.naam, leden: [...w.b.leden] } });
  }));
  return lijst;
}
const unitNaam = leden => leden.map(naam).join(' / ');
function vastgezet() { // gepubliceerde planning met de genomen besluiten erop toegepast
  const v = kloon(gepubliceerd.planning);
  (na().vervang || []).forEach(({ d, uit, in: nieuw }) => v.forEach(w => {
    if (w.d !== d) return;
    [w.a, w.b].forEach(u => { if (u.leden.includes(uit)) { u.leden = u.leden.map(x => x === uit ? nieuw : x); u.naam = unitNaam(u.leden); } });
  }));
  v.forEach(w => { if (na().vervallen[w.k]) w.vervallen = true; });
  return v;
}
function toon() { return liveModus() ? liveWedstrijden() : vastgezet(); }
const echteSpelers = w => [...w.a.leden, ...w.b.leden].filter(x => !String(x).startsWith('~'));

function overzichtVan(id, lijst) {
  return (lijst || toon()).filter(w => echteSpelers(w).includes(id)).map(w => {
    const eigen = w.a.leden.includes(id) ? w.a : w.b, tegen = eigen === w.a ? w.b : w.a;
    return { tijd: E.toTijd(w.t), min: w.t, baan: w.baan, d: w.d, klasse: w.label, titel: w.titel, met: eigen.leden.filter(m => m !== id).map(naam)[0] || '', tegen: tegen.naam, vervallen: !!w.vervallen };
  }).sort((a, b) => a.min - b.min);
}
function handtekening() {
  const lijst = toon();
  let h = 0; const t = JSON.stringify(lijst.map(w => [w.k, w.a.naam, w.b.naam, !!w.vervallen]));
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return String(h);
}
function eindeVan(lijst) {
  const actief = lijst.filter(w => !w.vervallen);
  return actief.length ? Math.max(...actief.map(w => w.t)) + S.inst.duur : null;
}
function statsVan(lijst) {
  const per = {}; lijst.filter(w => !w.vervallen).forEach(w => echteSpelers(w).forEach(p => (per[p] = per[p] || []).push(w)));
  let achter = 0, wissel = 0, teveel = 0; const len = S.inst.duur + S.inst.pauze;
  Object.values(per).forEach(l => { l.sort((a, b) => a.t - b.t); let r = 1;
    for (let i = 1; i < l.length; i++) { if (l[i].t - l[i - 1].t === len) { achter++; r++; if (l[i].baan !== l[i - 1].baan) wissel++; if (r > S.inst.maxAchterElkaar) teveel++; } else r = 1; } });
  return { achter, wissel, teveel };
}

// ----- wijzigingen na publicatie -----
function speeltIn(lijst) { // d -> Set van spelers met een niet-vervallen wedstrijd
  const m = {}; lijst.filter(w => !w.vervallen).forEach(w => echteSpelers(w).forEach(p => { (m[w.d] = m[w.d] || new Set()).add(p); }));
  return m;
}
function ingeschrevenVoor(id, d) {
  const p = speler(id); if (!p) return false;
  if (d === 'HE' || d === 'DE') return p.E && p.sexe === E.ONDERDELEN[d].sexe;
  return DUBBEL.includes(d) && R.partnerInfo[d].koppels.some(k => k.a === id || k.b === id);
}
function openWijzigingen() {
  if (liveModus()) return [];
  const lijst = vastgezet(), speelt = speeltIn(lijst), uit = [], erbij = [];
  E.VOLGORDE.forEach(d => {
    // afmeldingen: speelt in de vastgezette planning, maar is niet meer ingeschreven
    const units = {};
    lijst.filter(w => w.d === d && !w.vervallen).forEach(w => [w.a, w.b].forEach(u => { if (!u.leden.some(x => String(x).startsWith('~'))) units[u.leden.join('+')] = u.leden; }));
    Object.values(units).forEach(leden => {
      const weg = leden.filter(id => !ingeschrevenVoor(id, d) && !(S.besl.na.nietIndelen[`${id}|${d}`]));
      const echtWeg = leden.filter(id => { const p = speler(id); const veld = ODVELD[d]; return !p || !p[veld]; });
      if (echtWeg.length) uit.push({ d, leden, weg: echtWeg });
    });
    // nieuwe deelnemers: ingeschreven (en bij dubbel gekoppeld), maar zonder wedstrijden in de vastgezette planning
    spelers.forEach(p => {
      if (!ingeschrevenVoor(p.id, d) || (speelt[d] && speelt[d].has(p.id)) || na().nietIndelen[`${p.id}|${d}`]) return;
      if (d === 'HE' || d === 'DE' || !erbij.some(x => x.d === d && x.ids.includes(p.id))) {
        const k = DUBBEL.includes(d) ? R.partnerInfo[d].koppels.find(k => k.a === p.id || k.b === p.id) : null;
        const ids = (k ? [k.a, k.b] : [p.id]).filter(id => !(speelt[d] && speelt[d].has(id)));
        erbij.push({ d, ids });
      }
    });
  });
  return { uit, erbij, aantal: uit.length + erbij.length };
}
function wedstrijdenVanUnit(lijst, d, leden) {
  return lijst.filter(w => w.d === d && !w.vervallen && [w.a, w.b].some(u => u.leden.join('+') === leden.join('+')));
}
function impactHerplannen() {
  const oud = vastgezet(), nieuw = liveWedstrijden();
  const ids = new Set([...oud, ...nieuw].flatMap(echteSpelers));
  const anders = [...ids].filter(id => JSON.stringify(overzichtVan(id, oud).filter(x => !x.vervallen).map(x => [x.min, x.baan, x.d])) !== JSON.stringify(overzichtVan(id, nieuw).map(x => [x.min, x.baan, x.d])));
  return { anders, eindOud: eindeVan(oud), eindNieuw: eindeVan(nieuw) };
}
function vervangKandidaten(d, uitId, lijst) {
  const p = speler(uitId) || (ruweSpelers.find(x => x.id === uitId));
  const speelt = speeltIn(lijst);
  const sexe = p ? p.sexe : null;
  // ingeschreven voor dit onderdeel (ook reservelijst), niet afgemeld en nog zonder wedstrijden in dit onderdeel
  return ruweSpelers.filter(q => q[ODVELD[d]] && !((S.besl.afgemeld[q.id] || {})[ODVELD[d]]) && q.sexe === sexe && !(speelt[d] && speelt[d].has(q.id)) && q.id !== uitId);
}
function conflictenVoor(kandidaat, wedstrijden, lijst) {
  const eigen = lijst.filter(w => !w.vervallen && echteSpelers(w).includes(kandidaat));
  return wedstrijden.filter(w => eigen.some(x => x.t === w.t)).map(w => E.toTijd(w.t));
}
function berichtTekst(vn, regels) { return `${groet(vn)}\n\n${regels}` + onder(); }
function besluit(soort, tekst, berichten) {
  na().besluiten.push({ id: String(Date.now()), soort, tekst, op: new Date().toISOString(), berichten });
}

function kiesVervallen(i) {
  const w = openWijzigingen().uit[i]; if (!w) return;
  const lijst = vastgezet(), wed = wedstrijdenVanUnit(lijst, w.d, w.leden), od = E.ONDERDELEN[w.d].naam.toLowerCase();
  wed.forEach(x => { na().vervallen[x.k] = { reden: 'afmelding', op: new Date().toISOString() }; });
  const blijvers = w.leden.filter(id => !w.weg.includes(id));
  blijvers.forEach(id => { na().nietIndelen[`${id}|${w.d}`] = true; });
  const berichten = [];
  const tegenstanders = {};
  wed.forEach(x => { const tegen = x.a.leden.join('+') === w.leden.join('+') ? x.b : x.a; tegen.leden.forEach(id => (tegenstanders[id] = tegenstanders[id] || []).push(x)); });
  Object.entries(tegenstanders).forEach(([id, xs]) => { const p = speler(id) || ruweSpelers.find(q => q.id === id); if (!p) return;
    berichten.push({ aan: id, onderwerp: 'Clubkampioenschappen: wedstrijd vervalt', tekst: berichtTekst(p.vn, `${unitNaam(w.weg)} heeft zich afgemeld voor ${od}. Daardoor vervalt${xs.length > 1 ? 'en' : ''} je wedstrijd${xs.length > 1 ? 'en' : ''} om ${xs.map(x => E.toTijd(x.t)).join(', ')}. Je andere wedstrijden blijven op dezelfde tijd.`) }); });
  blijvers.forEach(id => { const p = speler(id); if (!p) return;
    berichten.push({ aan: id, onderwerp: `Clubkampioenschappen: je partner voor ${od} heeft zich afgemeld`, tekst: berichtTekst(p.vn, `${unitNaam(w.weg)} heeft zich afgemeld voor ${od}. Daardoor vervallen jullie ${od}-wedstrijden. Je andere wedstrijden blijven op dezelfde tijd.\n\nKen je iemand die je plaats als partner wil innemen? Laat het ons weten, dan kijken we of dat nog in te passen is.`) }); });
  besluit('vervallen', `${unitNaam(w.leden)}: ${wed.length} wedstrijden ${od} laten vervallen na afmelding van ${unitNaam(w.weg)}.`, berichten);
  bewaar(); herbereken();
}
function kiesVervangen(i, nieuwId) {
  const w = openWijzigingen().uit[i]; if (!w || !nieuwId) return;
  const lijst = vastgezet(), wed = wedstrijdenVanUnit(lijst, w.d, w.leden), od = E.ONDERDELEN[w.d].naam.toLowerCase();
  const uitId = w.weg[0];
  na().vervang.push({ d: w.d, uit: uitId, in: nieuwId });
  delete na().nietIndelen[`${nieuwId}|${w.d}`];
  const nieuw = speler(nieuwId) || ruweSpelers.find(q => q.id === nieuwId), nieuweLeden = w.leden.map(x => x === uitId ? nieuwId : x);
  const regels = wed.map(x => { const tegen = x.a.leden.join('+') === w.leden.join('+') ? x.b : x.a; return `${E.toTijd(x.t)}  baan ${x.baan}  ${E.ONDERDELEN[w.d].naam} ${x.label}, tegen ${tegen.naam}`; }).join('\n');
  const berichten = [{ aan: nieuwId, onderwerp: `Clubkampioenschappen: je speelt ${od}`, tekst: berichtTekst(nieuw.vn, `Je neemt bij ${od} de plaats in van ${naam(uitId)}${nieuweLeden.length > 1 ? `, samen met ${unitNaam(nieuweLeden.filter(x => x !== nieuwId))}` : ''}. Dit zijn je wedstrijden:\n\n${regels}\n\nDe actuele planning staat altijd in de spelersweergave:\n${SPELERS_LINK}`) }];
  nieuweLeden.filter(x => x !== nieuwId).forEach(id => { const p = speler(id); if (p) berichten.push({ aan: id, onderwerp: `Clubkampioenschappen: nieuwe partner voor ${od}`, tekst: berichtTekst(p.vn, `${naam(uitId)} heeft zich afgemeld. Je speelt ${od} nu met ${nieuw.naam}. Je tijden blijven gelijk.`) }); });
  na().nietIndelen[`${uitId}|${w.d}`] = true;
  besluit('vervangen', `${naam(uitId)} vervangen door ${nieuw.naam} bij ${od} (${wed.length} wedstrijden, tijden ongewijzigd).`, berichten);
  bewaar(); herbereken();
}
function kiesNietIndelen(i) {
  const w = openWijzigingen().erbij[i]; if (!w) return;
  const od = E.ONDERDELEN[w.d].naam.toLowerCase();
  w.ids.forEach(id => { na().nietIndelen[`${id}|${w.d}`] = true; });
  const berichten = w.ids.map(id => { const p = speler(id); return p && { aan: id, onderwerp: `Clubkampioenschappen: ${od}`, tekst: berichtTekst(p.vn, `Bedankt voor je aanmelding voor ${od}. De planning was al rond en verstuurd, en er is helaas geen plek meer om je in te passen zonder alle tijden te wijzigen. We hebben je op de reservelijst gezet: valt er iemand af, dan nemen we contact met je op.`) }; }).filter(Boolean);
  besluit('reserve', `${unitNaam(w.ids)} niet ingedeeld bij ${od} (aanmelding na publicatie, reservelijst).`, berichten);
  bewaar(); herbereken();
}
function kiesHerplannen() {
  const imp = impactHerplannen();
  na().herplannen = true;
  imp.anders.forEach(id => { delete S.besl.verstuurd[`overzicht|${id}`]; });
  besluit('herplannen', `Opnieuw gepland: ${imp.anders.length} spelers krijgen andere tijden. Publiceer opnieuw en stuur hen een nieuw overzicht.`, []);
  bewaar(); herbereken();
}

function rWijzigingen() {
  const ow = openWijzigingen(); if (!ow || !ow.aantal) return '';
  const lijst = vastgezet(), imp = impactHerplannen();
  const herplanImpact = `<b>Gevolg:</b> ${imp.anders.length} spelers krijgen andere tijden of banen en moeten een nieuw overzicht krijgen. Laatste wedstrijd klaar om ${imp.eindNieuw ? E.toTijd(imp.eindNieuw) : '-'} (nu ${imp.eindOud ? E.toTijd(imp.eindOud) : '-'}). Daarna opnieuw publiceren.`;
  const kaartUit = (w, i) => {
    const od = E.ONDERDELEN[w.d].naam, wed = wedstrijdenVanUnit(lijst, w.d, w.leden);
    const tegen = [...new Set(wed.flatMap(x => (x.a.leden.join('+') === w.leden.join('+') ? x.b : x.a).leden))].map(naam);
    const blijvers = w.leden.filter(id => !w.weg.includes(id));
    const poule = wed[0] ? lijst.filter(x => x.d === w.d && x.label === wed[0].label && !x.vervallen) : [];
    const deelnemers = new Set(poule.flatMap(x => [x.a.leden.join('+'), x.b.leden.join('+')])).size;
    const kand = vervangKandidaten(w.d, w.weg[0], lijst).map(q => ({ q, conflict: conflictenVoor(q.id, wed, lijst) }));
    const opties = kand.map(({ q, conflict }) => `<option value="${esc(q.id)}" ${conflict.length ? 'disabled' : ''}>${esc(q.naam)} (niveau ${S.niveaus[q.id] || 3})${conflict.length ? ` – speelt al om ${conflict.join(', ')}` : ''}</option>`).join('');
    return `<div class="voorstel"><div>${odChip(w.d)} <b>${esc(unitNaam(w.weg))}</b> heeft zich afgemeld voor ${od.toLowerCase()}. In de gepubliceerde planning ${wed.length === 1 ? 'staat 1 wedstrijd' : `staan ${wed.length} wedstrijden`} (${wed.map(x => E.toTijd(x.t)).join(', ')})${blijvers.length ? `, samen met ${esc(unitNaam(blijvers))}` : ''}.</div>
      <div class="stapel">
        <div><button class="knop klein primair" type="button" data-wijz="vervallen" data-i="${i}">Wedstrijden laten vervallen</button>
          <div class="klein"><b>Gevolg:</b> ${wed.length} wedstrijden vervallen; alle andere tijden blijven gelijk. Bericht naar ${tegen.length} tegenstander${tegen.length === 1 ? '' : 's'} (${esc(tegen.join(', '))})${blijvers.length ? ` en naar ${esc(unitNaam(blijvers))}, die dan geen ${od.toLowerCase()} meer speelt` : ''}. Poule ${esc(wed[0] ? wed[0].label : '')} gaat van ${deelnemers} naar ${deelnemers - 1} deelnemers${deelnemers - 1 < S.inst.minPoule ? ` <span class="chip fout">onder het minimum van ${S.inst.minPoule}</span>` : ''}.</div></div>
        <div class="koppel-kies"><label class="klein" for="verv-${i}">Vervangen door</label><select id="verv-${i}"><option value="">${kand.length ? 'Kies een vervanger…' : 'Geen vervanger beschikbaar'}</option>${opties}</select>
          <button class="knop klein" type="button" data-wijz="vervangen" data-i="${i}" ${kand.some(k => !k.conflict.length) ? '' : 'disabled'}>Vervangen</button>
          <div class="klein" style="flex-basis:100%"><b>Gevolg:</b> de vervanger neemt ${wed.length} wedstrijden over op dezelfde tijden en banen. Bericht naar de vervanger${blijvers.length ? ' en de partner' : ''}. Alleen ingeschreven spelers zonder wedstrijden in dit onderdeel kunnen vervangen; wie op hetzelfde moment al speelt, staat uitgegrijsd.</div></div>
        <div><button class="knop klein" type="button" data-wijz="herplannen">Alles opnieuw plannen</button><div class="klein">${herplanImpact}</div></div>
      </div></div>`;
  };
  const kaartErbij = (w, i) => {
    const od = E.ONDERDELEN[w.d].naam;
    return `<div class="voorstel"><div>${odChip(w.d)} <b>${esc(unitNaam(w.ids))}</b> ${w.ids.length > 1 ? 'zijn' : 'is'} ingeschreven voor ${od.toLowerCase()}, maar ${w.ids.length > 1 ? 'hebben' : 'heeft'} geen wedstrijden in de gepubliceerde planning (aanmelding na publicatie, of partner van iemand die afviel).</div>
      <div class="stapel">
        <div><button class="knop klein primair" type="button" data-wijz="reserve" data-i="${i}">Niet indelen (reservelijst)</button><div class="klein"><b>Gevolg:</b> de planning blijft zoals hij is. Bericht naar ${esc(unitNaam(w.ids))} dat ${w.ids.length > 1 ? 'ze op de reservelijst staan' : 'die op de reservelijst staat'}. Valt er later iemand af, dan kun je ze daar als vervanger kiezen.</div></div>
        <div><button class="knop klein" type="button" data-wijz="herplannen">Alles opnieuw plannen</button><div class="klein">${herplanImpact}</div></div>
      </div></div>`;
  };
  return `<div class="paneel stapel"><h3>Wijzigingen na publicatie <span class="chip letop">${ow.aantal} te beslissen</span></h3>
    <p class="klein zacht">De planning is gepubliceerd en ligt daarom vast. Kies per wijziging wat er moet gebeuren. Je ziet bij elke keuze wat het gevolg is.</p>
    ${ow.uit.map(kaartUit).join('')}${ow.erbij.map(kaartErbij).join('')}</div>`;
}
function rBesluiten() {
  const lijst = (na().besluiten || []).slice().reverse();
  if (!lijst.length) return '';
  return `<div class="paneel stapel"><h3>Genomen besluiten</h3>${lijst.map(b => `<div class="stapel" style="gap:8px"><div class="klein"><b>${new Date(b.op).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</b> ${esc(b.tekst)}</div>
    ${(b.berichten || []).map((m, j) => { const p = speler(m.aan) || ruweSpelers.find(q => q.id === m.aan); const key = `besluit|${b.id}|${j}`; registreer(key, { aan: p ? p.email : '', naam: p ? p.naam : m.aan, onderwerp: m.onderwerp, tekst: m.tekst }); return mailKaart(mailRegister[key], key); }).join('')}</div>`).join('')}</div>`;
}

function rPlanning() {
  const lijst = toon(), N = Math.max(S.inst.banen, ...lijst.map(w => w.baan), 1);
  const live = liveModus();
  const deelnemersIds = new Set(lijst.flatMap(echteSpelers));
  const opties = spelers.filter(p => deelnemersIds.has(p.id)).sort((a, b) => a.naam.localeCompare(b.naam)).map(p => `<option value="${esc(p.id)}" ${filterSpeler === p.id ? 'selected' : ''}>${esc(p.naam)}</option>`).join('');
  const tijden = [...new Set(lijst.map(w => w.t))].sort((a, b) => a - b);
  let rijen = '', lunchGetoond = false;
  const ls = E.toMin(S.inst.lunchStart);
  tijden.forEach(t => {
    if (S.inst.lunch && !lunchGetoond && t >= ls) { lunchGetoond = true; rijen += `<tr class="pauze"><td colspan="${N + 1}">Lunchpauze ${esc(S.inst.lunchStart)} – ${E.toTijd(ls + S.inst.lunchDuur)}</td></tr>`; }
    rijen += `<tr><td class="tijd">${E.toTijd(t)}</td>` + Array.from({ length: N }, (_, b) => {
      const w = lijst.find(x => x.t === t && x.baan === b + 1);
      if (!w) return '<td></td>';
      const cls = (filterSpeler ? (echteSpelers(w).includes(filterSpeler) ? 'licht' : 'dim') : '') + (w.vervallen ? ' vervallen' : '');
      return `<td><div class="wed ${w.d} ${cls}"><div class="titel"><span>${E.ONDERDELEN[w.d].kort} ${esc(w.label)}</span><span>${w.vervallen ? 'vervallen' : esc(w.titel)}</span></div><div>${esc(w.a.naam)}</div><div class="tegen">tegen</div><div>${esc(w.b.naam)}</div></div></td>`;
    }).join('') + '</tr>';
  });
  const st = statsVan(lijst), einde = eindeVan(lijst);
  const alt = live ? alternatieven.map(a => R.modus === 'eind' ? `${esc(a.label)}: beginnen om ${esc(a.start)}` : `${esc(a.label)}: klaar om ${E.toTijd(a.einde)}`).join(' · ') : '';
  const actueel = gepubliceerd && gepubliceerd.handtekening === handtekening();
  const ow = openWijzigingen();
  const pubTekst = !db ? 'Publiceren werkt alleen als de pagina op claude.ai geopend is.'
    : !gepubliceerd ? 'Nog niet gepubliceerd. Tot je publiceert, past de tool de planning steeds automatisch aan.'
    : actueel ? `Gepubliceerd op ${new Date(gepubliceerd.bijgewerkt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}. De planning ligt vast; wijzigingen vragen eerst om een keuze.`
    : na().herplannen ? 'Opnieuw gepland na publicatie. Spelers zien nog de oude versie: publiceer opnieuw en stuur de betrokken spelers een nieuw overzicht.'
    : 'Er zijn besluiten genomen sinds de laatste publicatie. Publiceer opnieuw zodat spelers de wijzigingen zien.';
  const vastNotitie = !live ? `<p class="klein zacht">Omdat de planning vastligt, veranderen wijzigingen in instellingen, niveaus of klassen het rooster niet meer. Wil je die toch doorvoeren? <button class="knop klein" type="button" data-wijz="herplannen">Alles opnieuw plannen</button></p>` : '';
  return `<div class="stapel">
    <div class="paneel stapel">${stapKop('5. Planning', 'Het rooster per tijd en baan. Publiceer het als het klopt: dan zien spelers hun eigen wedstrijden in de spelersweergave en ligt de planning vast.',
      `<button class="knop primair" type="button" id="publiceer" ${db && !(ow && ow.aantal) ? '' : 'disabled'}>${gepubliceerd ? 'Opnieuw publiceren' : 'Publiceren voor spelers'}</button>`)}
      <p class="klein">${actueel ? '<span class="chip goed">gepubliceerd</span>' : gepubliceerd ? '<span class="chip letop">niet actueel</span>' : '<span class="chip">concept</span>'} ${esc(pubTekst)} <span id="pubStatus"></span></p>
      ${ow && ow.aantal ? '<p class="klein"><span class="chip fout">eerst beslissen</span> Neem eerst een besluit over de wijzigingen hieronder; daarna kun je opnieuw publiceren.</p>' : ''}
      ${vastNotitie}
      ${live && R.meldingen.some(m => m.niveau === 'probleem') ? rMeldingen(R.meldingen.filter(m => m.niveau === 'probleem')) : ''}</div>
    ${rWijzigingen()}
    <div class="rij" style="justify-content:space-between">
      <div class="legenda">${E.VOLGORDE.filter(actiefD).map(d => { const o = S.inst.onderdelen[d]; const b = S.inst.tijdblokken && (o.van || o.tot) ? ` ${o.van || '…'}–${o.tot || '…'}` : ''; return `<span class="chip od od-${d}">${E.ONDERDELEN[d].naam}${b}</span>`; }).join('')}</div>
      <div class="veld" style="min-width:220px"><label for="filterSpeler">Markeer speler</label><select id="filterSpeler"><option value="">Iedereen</option>${opties}</select></div>
    </div>
    <p class="zacht klein num">${lijst.filter(w => !w.vervallen).length} wedstrijden${lijst.some(w => w.vervallen) ? ` (${lijst.filter(w => w.vervallen).length} vervallen)` : ''}, laatste klaar om ${einde ? E.toTijd(einde) : '-'}. ${st.achter} keer twee wedstrijden achter elkaar, waarvan ${st.wissel} keer met een baanwissel.${alt ? ' Ter vergelijking ' + alt + '.' : ''}</p>
    <div class="schema-box"><table class="schema"><thead><tr><th>Tijd</th>${Array.from({ length: N }, (_, i) => `<th>Baan ${i + 1}</th>`).join('')}</tr></thead><tbody>${rijen || `<tr><td colspan="${N + 1}" class="leeg">Er zijn nog geen wedstrijden om te plannen.</td></tr>`}</tbody></table></div>
    ${rBesluiten()}
    ${live ? `<div class="paneel"><h3>Meldingen</h3>${rMeldingen(R.meldingen)}</div>` : ''}
    ${volgende('planning')}</div>`;
}
async function publiceer() {
  if (!db) return;
  const lijst = toon();
  const data = { bijgewerkt: new Date().toISOString(), planning: lijst, spelers: {} };
  data.handtekening = (() => { let h = 0; const t = JSON.stringify(lijst.map(w => [w.k, w.a.naam, w.b.naam, !!w.vervallen])); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); })();
  spelers.forEach(p => { const o = overzichtVan(p.id, lijst); if (o.length) data.spelers[p.naam] = o.map(({ tijd, baan, d, klasse, titel, met, tegen, vervallen }) => ({ tijd, baan, d, klasse, titel, met, tegen, vervallen })); });
  const st = $('#pubStatus'); if (st) st.textContent = 'Bezig…';
  try {
    await db.doc(PUB).set(data); gepubliceerd = kloon(data);
    S.besl.na = { ...na(), vervallen: {}, vervang: [], herplannen: false };
    bewaar(); herbereken();
  } catch (e) { if (st) st.textContent = e && e.code === 'quota_exceeded' ? 'De opslag is vol.' : 'Publiceren mislukte. Probeer het opnieuw.'; }
}

// ---------- mails ----------
const groet = vn => `Beste ${vn},`;
const formulierLink = () => `https://tally.so/r/${S.inst.tallyForm}`;
const onder = () => `\n\nMet sportieve groet,\n${S.comm.afzender}`;
function mailGeenPartner(p, d) {
  const od = E.ONDERDELEN[d].naam.toLowerCase();
  return { aan: p.email, naam: p.naam, onderwerp: `Clubkampioenschappen: nog geen partner voor ${od}`,
    tekst: `${groet(p.vn)}\n\nJe hebt je ingeschreven voor ${od} bij de clubkampioenschappen. Helaas hebben we nog geen partner voor je kunnen vinden.\n\nKen jij iemand die met je wil spelen? Vraag diegene dan om zich zelf in te schrijven voor ${od} via het inschrijfformulier, en daarbij jouw naam (${p.naam}) als partner op te geven:\n${formulierLink()}\n\nSchrijft je partner zich in, dan koppelen wij jullie aan elkaar. Lukt het niet om een partner te vinden, dan kun je ${od} helaas niet spelen. De andere onderdelen waarvoor je bent ingeschreven speel je gewoon mee.` + onder() };
}
function mailOverzicht(p) {
  const o = overzichtVan(p.id).filter(x => !x.vervallen);
  const regels = o.map(x => `${x.tijd}  baan ${x.baan}  ${E.ONDERDELEN[x.d].naam} ${x.klasse}${x.titel ? ' (' + x.titel.toLowerCase() + ')' : ''}${x.met ? ', met ' + x.met : ''}, tegen ${x.tegen}`).join('\n');
  return { aan: p.email, naam: p.naam, onderwerp: 'Clubkampioenschappen: jouw speeltijden',
    tekst: `${groet(p.vn)}\n\nHieronder staan jouw wedstrijden op de clubkampioenschappen:\n\n${regels}\n\nKom op tijd en meld je bij de wedstrijdtafel. De actuele planning staat altijd in de spelersweergave:\n${SPELERS_LINK}` + onder() };
}
const mailto = m => `mailto:${encodeURIComponent(m.aan || '')}?subject=${encodeURIComponent(m.onderwerp)}&body=${encodeURIComponent(m.tekst)}`;
function mailKaart(m, key) {
  const v = verstuurd(key);
  return `<div class="mail ${v ? 'verstuurd' : ''}"><div class="kopregel"><span><b>Aan:</b> ${esc(m.naam)} &lt;${esc(m.aan || 'geen adres')}&gt;</span><span><b>Onderwerp:</b> ${esc(m.onderwerp)}</span></div>
    <pre>${esc(m.tekst)}</pre>
    <div class="rij"><a class="knop klein primair" href="${esc(mailto(m))}" target="_blank" rel="noopener">Openen in mailprogramma</a>
      <button class="knop klein" type="button" data-kopieer="${esc(key)}">Kopieer tekst</button>
      <label class="klein rij" style="gap:4px"><input type="checkbox" data-verstuurd="${esc(key)}" ${v ? 'checked' : ''}> Verstuurd${v ? ' op ' + new Date(v).toLocaleDateString('nl-NL') : ''}</label>
      <span class="zacht klein" data-kopieerstatus="${esc(key)}"></span></div></div>`;
}
const mailRegister = {}; // key -> mail, voor kopieerknoppen
function registreer(key, m) { mailRegister[key] = m; return m; }

// ---------- stap 6: communicatie ----------
function groepLeden(g) {
  if (g === 'iedereen') return spelers;
  if (g === 'spelers') return spelers.filter(p => p.E || p.D || p.G);
  if (g === 'eters') return spelers.filter(p => p.eet);
  if (g === 'geenpartner') return [...new Set(zonderPartner().map(x => x.id))].map(speler);
  if (E.ONDERDELEN[g]) { const lijst = toon(); return spelers.filter(p => overzichtVan(p.id, lijst).some(x => x.d === g && !x.vervallen)); }
  return spelers;
}
function rCommunicatie() {
  const lijstNu = toon();
  const metWed = spelers.filter(p => overzichtVan(p.id, lijstNu).length).sort((a, b) => a.naam.localeCompare(b.naam));
  const z = E.norm(zoekSpeler);
  const zichtbaar = metWed.filter(p => !z || E.norm(p.naam).includes(z));
  const nVerstuurd = metWed.filter(p => verstuurd(`overzicht|${p.id}`)).length;
  const actueel = gepubliceerd && gepubliceerd.handtekening === handtekening();
  const ov = zichtbaar.map(p => {
    const key = `overzicht|${p.id}`; const m = registreer(key, mailOverzicht(p)); const v = verstuurd(key);
    return `<details class="mailrij-wrap"><summary class="mailrij"><span><b>${esc(p.naam)}</b> <span class="zacht klein">${overzichtVan(p.id).length} wedstrijden</span></span><span class="klein zacht">${esc(p.email)}</span><span>${v ? '<span class="chip goed">verstuurd</span>' : '<span class="chip">nog niet verstuurd</span>'}</span></summary>${mailKaart(m, key)}</details>`;
  }).join('');
  const groepen = [['iedereen', 'Alle inschrijvers'], ['spelers', 'Alle spelers'], ['eters', 'Iedereen die mee-eet'], ['geenpartner', 'Spelers zonder partner'], ...E.VOLGORDE.filter(actiefD).map(d => [d, E.ONDERDELEN[d].naam])];
  const leden = groepLeden(S.comm.groep);
  const adressen = leden.map(p => p.email).filter(Boolean);
  const med = registreer('mededeling', { aan: '', naam: `${leden.length} ontvangers (zet de adressen in BCC)`, onderwerp: S.comm.onderwerp || 'Clubkampioenschappen', tekst: S.comm.tekst || '' });
  return `<div class="stapel">
    <div class="paneel stapel">${stapKop('6. Communicatie', 'Stuur iedere speler een persoonlijk overzicht van de speeltijden, of een mededeling aan een groep. Een mail opent in je eigen mailprogramma, zodat je hem eerst kunt nakijken. Lukt openen niet, kopieer dan de tekst.')}
      <div class="formgrid">${veld('afzender', 'Ondertekening', `<input id="afzender" type="text" value="${esc(S.comm.afzender)}" data-comm="afzender">`)}</div>
      ${actueel ? '' : '<p class="klein"><span class="chip letop">let op</span> De planning is nog niet (opnieuw) gepubliceerd. Spelers die de link openen, zien dan niet de actuele tijden. Publiceer eerst bij stap 5.</p>'}
      <p class="klein zacht">Spelers kunnen hun wedstrijden ook zelf opzoeken via de spelersweergave: <span class="num">${esc(SPELERS_LINK)}</span>. Deel deze pagina daarvoor met de leden via de deelknop op claude.ai.</p></div>
    <div class="paneel stapel"><div class="stapkop"><h3>Speeloverzicht per speler</h3><span class="klein zacht num">${nVerstuurd} van ${metWed.length} verstuurd</span></div>
      <div class="rij"><div class="veld" style="flex:1;max-width:320px"><label for="zoek">Zoek speler</label><input id="zoek" type="search" value="${esc(zoekSpeler)}" placeholder="Naam"></div>
        <button class="knop klein" type="button" id="kopieerAdressen" data-adressen="${esc(metWed.map(p => p.email).filter(Boolean).join(', '))}">Kopieer alle e-mailadressen</button><span id="adresStatus" class="zacht klein"></span></div>
      <div>${ov || '<p class="leeg">Geen speler gevonden.</p>'}</div></div>
    <div class="paneel stapel"><h3>Mededeling aan een groep</h3>
      <div class="formgrid">
        ${veld('groep', 'Aan', `<select id="groep" data-comm="groep">${groepen.map(([k, t]) => `<option value="${k}" ${S.comm.groep === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`, `${leden.length} ontvangers`)}
        ${veld('onderwerp', 'Onderwerp', `<input id="onderwerp" type="text" value="${esc(S.comm.onderwerp)}" data-comm="onderwerp" placeholder="Bijvoorbeeld: wijziging aanvangstijd">`)}
      </div>
      <div class="veld"><label for="tekst">Bericht</label><textarea id="tekst" data-comm="tekst" placeholder="Schrijf hier je bericht…">${esc(S.comm.tekst)}</textarea></div>
      <div class="rij"><a class="knop klein primair" href="${esc(`mailto:?bcc=${encodeURIComponent(adressen.join(','))}&subject=${encodeURIComponent(med.onderwerp)}&body=${encodeURIComponent(med.tekst + (med.tekst ? onder() : ''))}`)}" target="_blank" rel="noopener">Openen in mailprogramma (BCC)</a>
        <button class="knop klein" type="button" data-adressen="${esc(adressen.join(', '))}" id="kopieerGroep">Kopieer adressen</button>
        <button class="knop klein" type="button" data-kopieer="mededeling">Kopieer tekst</button><span class="zacht klein" data-kopieerstatus="mededeling"></span><span id="groepStatus" class="zacht klein"></span></div>
    </div></div>`;
}

// ---------- extra: instellingen en bbq ----------
function rBbq() {
  const eters = spelers.filter(p => p.eet);
  const groepen = {};
  eters.forEach(p => { const n = E.norm(p.dieet); if (!n || ['geen', 'nee', 'nvt', 'n v t'].includes(n)) return; (groepen[p.dieet.trim()] = groepen[p.dieet.trim()] || []).push(p.naam); });
  return `<div class="paneel stapel"><h2>BBQ</h2>
    <div class="tegels"><div class="tegel"><b>${eters.length}</b><span>eten mee</span></div><div class="tegel"><b>${spelers.length - eters.length}</b><span>eten niet mee</span></div><div class="tegel"><b>${Object.values(groepen).reduce((a, x) => a + x.length, 0)}</b><span>met dieetwens</span></div></div>
    <div class="tabel-box"><table class="lijst"><thead><tr><th>Dieetwens (zoals ingevuld)</th><th>Aantal</th><th>Wie</th></tr></thead><tbody>${Object.entries(groepen).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.length}</td><td>${v.map(esc).join(', ')}</td></tr>`).join('') || '<tr><td colspan="3" class="zacht">Geen dieetwensen.</td></tr>'}</tbody></table></div>
    <p class="zacht klein">Niet mee: ${spelers.filter(p => !p.eet).map(p => esc(p.naam)).join(', ') || 'niemand'}.</p></div>`;
}
function veld(id, label, html, hulp) { return `<div class="veld"><label for="${id}">${label}</label>${html}${hulp ? `<small>${hulp}</small>` : ''}</div>`; }
function num(id, waarde, min, max, stap, uit) { return `<input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" step="${stap || 1}" value="${waarde}" data-inst="${id}" ${uit ? 'disabled' : ''}>`; }
function rInstellingen() {
  const i = S.inst;
  return `<div class="stapel">
  <div class="paneel stapel"><h2>Dag en banen</h2><div class="formgrid">
    ${veld('banen', 'Aantal banen', num('banen', i.banen, 1, 7), 'De hal heeft 7 banen. Met 6 blijft er één vrij als terras.')}
    ${veld('eindModus', 'Wat ligt vast?', `<select id="eindModus" data-inst="eindModus">
      <option value="start" ${i.eindModus === 'start' ? 'selected' : ''}>Begintijd leidend</option>
      <option value="eind" ${i.eindModus === 'eind' ? 'selected' : ''}>Eindtijd leidend</option>
      <option value="venster" ${i.eindModus === 'venster' ? 'selected' : ''}>Begin- en eindtijd vast</option></select>`,
      { start: 'De tool berekent hoe laat je klaar bent.', eind: 'De tool rekent terug naar de begintijd.', venster: 'De tool past het toernooi in dit tijdvak en gebruikt ruimte over voor extra rust.' }[i.eindModus])}
    ${veld('start', 'Begintijd', `<input id="start" type="time" value="${esc(i.eindModus === 'eind' ? R.start : i.start)}" data-inst="start" ${i.eindModus === 'eind' ? 'disabled' : ''}>`, i.eindModus === 'eind' ? 'Berekend vanuit de eindtijd.' : '')}
    ${veld('eind', 'Eindtijd (incl. prijsuitreiking)', `<input id="eind" type="time" value="${esc(i.eindModus === 'start' ? E.toTijd(R.analyse.eindeDag) : i.eind)}" data-inst="eind" ${i.eindModus === 'start' ? 'disabled' : ''}>`, i.eindModus === 'start' ? 'Berekend vanuit de begintijd.' : 'Bijvoorbeeld de start van de bbq.')}
    ${veld('prijsuitreiking', 'Prijsuitreiking (minuten)', num('prijsuitreiking', i.prijsuitreiking, 0, 120, 5))}
    ${veld('lunch', 'Lunchpauze', `<select id="lunch" data-inst="lunch"><option value="nee" ${!i.lunch ? 'selected' : ''}>Geen lunchpauze</option><option value="ja" ${i.lunch ? 'selected' : ''}>Wel een lunchpauze</option></select>`)}
    ${veld('lunchStart', 'Lunch vanaf', `<input id="lunchStart" type="time" value="${esc(i.lunchStart)}" data-inst="lunchStart" ${i.lunch ? '' : 'disabled'}>`)}
    ${veld('lunchDuur', 'Lunchduur (minuten)', num('lunchDuur', i.lunchDuur, 10, 120, 5, !i.lunch))}
  </div></div>
  <div class="paneel stapel"><h2>Wedstrijd en rust</h2><div class="formgrid">
    ${veld('duur', 'Wedstrijdduur (minuten)', num('duur', i.duur, 4, 40), 'Een wedstrijd stopt na deze tijd of bij de eindscore, wat het eerst komt.')}
    ${veld('pauze', 'Pauze tussen wedstrijden (minuten)', num('pauze', i.pauze, 0, 15))}
    ${veld('maxAchterElkaar', 'Maximaal achter elkaar spelen', num('maxAchterElkaar', i.maxAchterElkaar, 1, 6), 'Voorkeur. Lukt het niet, dan plant de tool toch en meldt het.')}
    ${veld('minPoule', 'Minimale poulegrootte', num('minPoule', i.minPoule, 2, 8))}
    ${veld('maxPoule', 'Maximale poulegrootte', num('maxPoule', i.maxPoule, 3, 12))}
  </div><p class="zacht klein">Iemand staat nooit op twee banen tegelijk. Daarnaast probeert de tool spelers zo veel mogelijk op dezelfde baan te houden en de rust eerlijk te verdelen.</p></div>
  <div class="paneel stapel"><h2>Onderdelen</h2>
  <label class="rij" for="tijdblokken" style="gap:8px;font-weight:600"><input type="checkbox" id="tijdblokken" data-inst="tijdblokken" ${i.tijdblokken ? 'checked' : ''}> Elk onderdeel een eigen tijdblok</label>
  ${i.tijdblokken ? '<p class="zacht klein">Een onderdeel wordt alleen tussen "van" en "tot" gepland. Laat een veld leeg voor geen grens. Past een onderdeel niet in zijn blok, dan meldt de tool dat.</p>' : ''}
  <div class="tabel-box"><table class="lijst"><thead><tr><th>Onderdeel</th><th>Meedoen</th><th>Toernooivorm</th><th>Klassen</th>${i.tijdblokken ? '<th>Van</th><th>Tot</th>' : ''}</tr></thead><tbody>
    ${E.VOLGORDE.map(d => { const o = i.onderdelen[d]; return `<tr><td>${odChip(d)} ${E.ONDERDELEN[d].naam}</td>
      <td><input type="checkbox" id="act-${d}" data-od="${d}" data-k="actief" ${o.actief ? 'checked' : ''} aria-label="${E.ONDERDELEN[d].naam} meedoen"></td>
      <td><select id="vorm-${d}" data-od="${d}" data-k="vorm" aria-label="Toernooivorm ${E.ONDERDELEN[d].naam}"><option value="poule" ${o.vorm === 'poule' ? 'selected' : ''}>Poule per klasse</option><option value="poulefinale" ${o.vorm === 'poulefinale' ? 'selected' : ''}>Poules + finales</option><option value="knockout" ${o.vorm === 'knockout' ? 'selected' : ''}>Knock-out</option></select></td>
      <td><select id="kl-${d}" data-od="${d}" data-k="klassen" aria-label="Aantal klassen ${E.ONDERDELEN[d].naam}">${[1, 2, 3, 4].map(n => `<option value="${n}" ${o.klassen === n ? 'selected' : ''}>${n === 1 ? '1 (één klasse)' : n + ' (' + E.KLASSEN[n].join(', ') + ')'}</option>`).join('')}</select></td>
      ${i.tijdblokken ? `<td><input type="time" id="van-${d}" data-od="${d}" data-k="van" value="${esc(o.van || '')}" aria-label="${E.ONDERDELEN[d].naam} van"></td><td><input type="time" id="tot-${d}" data-od="${d}" data-k="tot" value="${esc(o.tot || '')}" aria-label="${E.ONDERDELEN[d].naam} tot"></td>` : ''}</tr>`; }).join('')}
  </tbody></table></div>
  <p class="zacht klein">Klassement in een poule: eerst gewonnen wedstrijden, dan puntensaldo, dan het onderlinge resultaat.</p></div>
  <div class="paneel stapel"><h2>Inschrijfformulier</h2><div class="formgrid">
    ${veld('tallyForm', 'Tally-formulier-ID', `<input id="tallyForm" type="text" value="${esc(i.tallyForm)}" data-inst="tallyForm">`, 'Het deel na tally.so/r/ in de link van het formulier.')}
  </div></div>
  <div class="rij"><button class="knop" type="button" id="standaard">Standaardinstellingen terugzetten</button></div></div>`;
}
function koppelInstellingen() {
  document.querySelectorAll('[data-inst]').forEach(el => el.addEventListener('change', () => {
    const k = el.dataset.inst; let v = el.value;
    if (el.type === 'number') { v = Number(v); if (!Number.isFinite(v)) return; v = Math.max(Number(el.min), Math.min(Number(el.max), v)); }
    if (k === 'lunch') v = v === 'ja';
    if (k === 'tijdblokken') v = el.checked;
    if (k === 'tallyForm') v = v.trim().replace(/^.*\/r\//, '').replace(/[^A-Za-z0-9]/g, '');
    S.inst[k] = v;
    if (S.inst.minPoule > S.inst.maxPoule) S.inst.maxPoule = S.inst.minPoule;
    bewaar(); setTimeout(herbereken, 0);
  }));
  document.querySelectorAll('[data-od]').forEach(el => el.addEventListener('change', () => {
    const o = S.inst.onderdelen[el.dataset.od];
    o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.dataset.k === 'klassen' ? Number(el.value) : el.value;
    bewaar(); setTimeout(herbereken, 0);
  }));
}

// ---------- spelersweergave ----------
function spelerData() {
  if (gepubliceerd && gepubliceerd.spelers) return { bron: 'gepubliceerd', spelers: gepubliceerd.spelers, bijgewerkt: gepubliceerd.bijgewerkt };
  if (!magSchrijven) return null;
  const lijst = toon(); const s = {}; spelers.forEach(p => { const o = overzichtVan(p.id, lijst); if (o.length) s[p.naam] = o; });
  return { bron: 'concept', spelers: s };
}
function renderSpelerModus() {
  $('#bronbalk').hidden = true; $('#tegels').hidden = true;
  $('#titel').textContent = 'Clubkampioenschappen: mijn wedstrijden';
  $('#stappen').innerHTML = magSchrijven ? `<button type="button" class="extra" data-stap="planning"><span class="tt">← Terug naar de planner</span></button>` : '';
  const data = spelerData();
  if (!data) { $('#inhoud').innerHTML = `<div class="spelerweergave"><div class="paneel"><h2>Nog geen planning</h2><p class="zacht">De toernooicommissie heeft de planning nog niet gepubliceerd. Kijk later nog eens.</p></div></div>`; return; }
  const namen = Object.keys(data.spelers).sort((a, b) => a.localeCompare(b));
  if (gekozenSpeler && !data.spelers[gekozenSpeler]) gekozenSpeler = '';
  const lijst = gekozenSpeler ? [...data.spelers[gekozenSpeler]].sort((a, b) => a.tijd.localeCompare(b.tijd)) : [];
  const kaarten = lijst.map(x => `<div class="wkaart ${x.d} ${x.vervallen ? 'vervallen' : ''}"><div><div class="tijd">${esc(x.tijd)}</div><div class="baan">baan ${x.baan}</div></div>
    <div><div class="rij" style="gap:6px">${odChip(x.d)}<b>${esc(E.ONDERDELEN[x.d].naam)} ${esc(x.klasse)}</b>${x.titel ? `<span class="chip">${esc(x.titel)}</span>` : ''}${x.vervallen ? '<span class="chip fout">vervalt</span>' : ''}</div>
    ${x.met ? `<div style="margin-top:4px">met <b>${esc(x.met)}</b></div>` : ''}<div style="margin-top:2px">tegen <b>${esc(x.tegen)}</b></div></div></div>`).join('');
  $('#inhoud').innerHTML = `<div class="spelerweergave">
    ${data.bron === 'concept' ? '<p class="klein"><span class="chip letop">concept</span> Dit is de huidige planning, nog niet gepubliceerd. Spelers zien dit pas na publiceren.</p>' : `<p class="zacht klein">Bijgewerkt op ${new Date(data.bijgewerkt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}.</p>`}
    <div class="veld"><label for="kiesSpeler">Kies je naam</label><select id="kiesSpeler"><option value="">Kies je naam…</option>${namen.map(n => `<option ${n === gekozenSpeler ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    ${gekozenSpeler ? `<h2>${esc(gekozenSpeler)}: ${lijst.filter(x => !x.vervallen).length} wedstrijden</h2>${kaarten}<p class="zacht klein">Tijden kunnen op de dag nog verschuiven als wedstrijden uitlopen. Houd de wedstrijdtafel in de gaten.</p>` : '<p class="zacht">Kies je naam om je wedstrijden te zien, gesorteerd op tijd.</p>'}
  </div>`;
}

// ---------- interactie ----------
function naarStap(k) { stap = k; try { history.replaceState(null, '', '#' + k); } catch (x) {} render(); window.scrollTo(0, 0); }
document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.stap) { naarStap(t.dataset.stap); return; }
  if (t.id === 'ophalen' || t.id === 'ophalen2') { haalOp(true); return; }
  if (t.id === 'startpunt') { S.besl.bekend = Object.fromEntries(ruweSpelers.map(p => [p.id, vingerafdruk(p)])); bewaar(); herbereken(); return; }
  if (t.dataset.verwerkt) { const id = t.dataset.verwerkt; const p = ruweSpelers.find(x => x.id === id); if (p) S.besl.bekend[id] = vingerafdruk(p); else delete S.besl.bekend[id]; bewaar(); herbereken(); return; }
  if (t.dataset.afmeld) { const [id, k] = t.dataset.afmeld.split('|'); const a = S.besl.afgemeld[id] = S.besl.afgemeld[id] || {}; if (a[k]) delete a[k]; else a[k] = new Date().toISOString(); if (!Object.keys(a).length) delete S.besl.afgemeld[id]; bewaar(); herbereken(); return; }
  if (t.id === 'publiceer') { publiceer(); return; }
  if (t.dataset.wijz) {
    const i = Number(t.dataset.i), soort = t.dataset.wijz;
    if (soort === 'vervallen') kiesVervallen(i);
    else if (soort === 'vervangen') { const sel = $('#verv-' + i); if (sel && sel.value) kiesVervangen(i, sel.value); }
    else if (soort === 'reserve') kiesNietIndelen(i);
    else if (soort === 'herplannen') kiesHerplannen();
    return;
  }
  if (t.dataset.niveau) { S.niveaus[t.dataset.speler] = Number(t.dataset.niveau); S.voorbeeldNiveaus = false; bewaar(); herbereken(); return; }
  if (t.dataset.partner) { S.besl.partners[t.dataset.partner] = t.dataset.keuze; bewaar(); herbereken(); return; }
  if (t.dataset.gezien) { const k = t.dataset.gezien; if (S.besl.gezien[k]) delete S.besl.gezien[k]; else S.besl.gezien[k] = true; bewaar(); herbereken(); return; }
  if (t.dataset.koppel) {
    const [d, a] = t.dataset.koppel.split('|'); const b = $('#' + CSS.escape(t.dataset.select)).value; if (!b) return;
    (S.besl.handKoppels[d] = S.besl.handKoppels[d] || []).push([a, b]); bewaar(); herbereken(); return;
  }
  if (t.dataset.ontkoppel) {
    const [d, a, b] = t.dataset.ontkoppel.split('|');
    S.besl.handKoppels[d] = (S.besl.handKoppels[d] || []).filter(([x, y]) => !(x === a && y === b)); bewaar(); herbereken(); return;
  }
  if (t.dataset.klasse) { S.besl.klasse[t.dataset.klasse] = Number(t.dataset.naar); bewaar(); herbereken(); return; }
  if (t.dataset.optie) { const o = JSON.parse(t.dataset.optie); o.units.forEach(u => { S.besl.klasse[`${o.d}|${u}`] = o.naar; }); bewaar(); herbereken(); return; }
  if (t.dataset.reset) { Object.keys(S.besl.klasse).forEach(k => { if (k.startsWith(t.dataset.reset + '|')) delete S.besl.klasse[k]; }); bewaar(); herbereken(); return; }
  if (t.id === 'standaard') { const form = S.inst.tallyForm; S.inst = kloon(E.STANDAARD); S.inst.tallyForm = form; bewaar(); herbereken(); return; }
  if (t.dataset.kopieer) {
    const key = t.dataset.kopieer;
    let m = mailRegister[key];
    if (!m && key.startsWith('geenpartner|')) { const [, d, id] = key.split('|'); m = mailGeenPartner(speler(id), d); }
    if (key === 'mededeling') m = { onderwerp: S.comm.onderwerp, tekst: S.comm.tekst + (S.comm.tekst ? onder() : '') };
    const st = document.querySelector(`[data-kopieerstatus="${CSS.escape(key)}"]`);
    try { await navigator.clipboard.writeText(`Onderwerp: ${m.onderwerp}\n\n${m.tekst}`); if (st) st.textContent = 'Gekopieerd'; }
    catch (x) { if (st) st.textContent = 'Kopiëren lukte niet in deze weergave'; }
    return;
  }
  if (t.dataset.adressen != null) {
    const st = $(t.id === 'kopieerGroep' ? '#groepStatus' : '#adresStatus');
    try { await navigator.clipboard.writeText(t.dataset.adressen); if (st) st.textContent = 'Adressen gekopieerd'; } catch (x) { if (st) st.textContent = 'Kopiëren lukte niet'; }
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'filterSpeler') { filterSpeler = el.value; setTimeout(render, 0); return; }
  if (el.id === 'kiesSpeler') { gekozenSpeler = el.value; try { localStorage.setItem('toernooi-speler', gekozenSpeler); } catch (x) {} setTimeout(render, 0); return; }
  if (el.dataset.verstuurd) { const k = el.dataset.verstuurd; if (el.checked) S.besl.verstuurd[k] = new Date().toISOString(); else delete S.besl.verstuurd[k]; bewaar(); setTimeout(render, 0); return; }
  if (el.dataset.comm) { S.comm[el.dataset.comm] = el.value; bewaar(); setTimeout(render, 0); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'zoek') { zoekSpeler = e.target.value; const pos = e.target.selectionStart; render(); const z = $('#zoek'); z.focus(); try { z.setSelectionRange(pos, pos); } catch (x) {} }
});

// ---------- start ----------
const h = (location.hash || '').slice(1);
if ([...STAPPEN.map(s => s.k), ...EXTRA.map(x => x[0])].includes(h)) stap = h;
pasToe(laadLokaal());
herbereken();
(async () => {
  let user = null;
  try { user = await claude.use('user'); } catch (x) {}
  if (user && typeof user.can === 'function') {
    try { const mag = await user.can('data.write'); if (mag === false) { magSchrijven = false; render(); } } catch (x) {}
  }
  if (magSchrijven) (async () => { try { mcp = await claude.use('mcp'); } catch (x) { mcp = null; } haalOp(false); })();
  try {
    db = await claude.use('db');
    if (db) {
      const timer = setTimeout(() => zetOpslag('Opslag nog niet bereikbaar'), 10000);
      try {
        const [snap, pub] = await Promise.all([db.doc(DOC).get(), db.doc(PUB).get()]); clearTimeout(timer);
        if (snap.exists && magSchrijven) pasToe(snap.data());
        if (pub.exists) gepubliceerd = pub.data();
        herbereken();
        zetOpslag('Wijzigingen worden opgeslagen');
        db.doc(PUB).onSnapshot(sn => { if (sn.exists) { const d = sn.data(); if (!gepubliceerd || d.bijgewerkt !== gepubliceerd.bijgewerkt) { gepubliceerd = d; render(); } } }, () => {});
      } catch (x) { clearTimeout(timer); db = null; zetOpslag('Alleen in deze browser bewaard'); render(); }
    } else zetOpslag('Alleen in deze browser bewaard');
  } catch (x) { zetOpslag('Alleen in deze browser bewaard'); }
})();

})();
