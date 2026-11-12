// Planningsmotor clubkampioenschappen – pure functies, geen DOM.
const ENGINE = (() => {
  const ONDERDELEN = {
    HE: { naam: 'Herenenkel', kort: 'HE', type: 'enkel', sexe: 'H', veld: 'E' },
    DE: { naam: 'Damesenkel', kort: 'DE', type: 'enkel', sexe: 'D', veld: 'E' },
    HD: { naam: 'Herendubbel', kort: 'HD', type: 'dubbel', sexe: 'H', veld: 'D' },
    DD: { naam: 'Damesdubbel', kort: 'DD', type: 'dubbel', sexe: 'D', veld: 'D' },
    GD: { naam: 'Gemengd dubbel', kort: 'GD', type: 'gemengd', veld: 'G' },
  };
  const VOLGORDE = ['HE', 'DE', 'HD', 'DD', 'GD'];
  const KLASSEN = { 1: ['Open'], 2: ['A', 'B'], 3: ['A', 'B', 'C'], 4: ['A', 'B', 'C', 'D'] };

  const STANDAARD = {
    banen: 6, start: '09:30', eindModus: 'start', eind: '16:30',
    duur: 12, pauze: 3, lunch: false, lunchStart: '12:30', lunchDuur: 30,
    prijsuitreiking: 15, maxAchterElkaar: 2, minPoule: 3, maxPoule: 6, tijdblokken: false,
    tallyForm: '5XjpLE',
    onderdelen: {
      HE: { actief: true, vorm: 'poule', klassen: 3, van: '', tot: '' },
      DE: { actief: true, vorm: 'poule', klassen: 3, van: '', tot: '' },
      HD: { actief: true, vorm: 'poule', klassen: 3, van: '', tot: '' },
      DD: { actief: true, vorm: 'poule', klassen: 3, van: '', tot: '' },
      GD: { actief: true, vorm: 'poule', klassen: 3, van: '', tot: '' },
    },
  };

  // ---------- hulpfuncties ----------
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const toMin = t => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const toTijd = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const r1 = x => Math.round(x * 10) / 10;

  // ---------- inschrijvingen inlezen (Tally fetch_submissions) ----------
  function leesTally(payload) {
    const data = payload && payload.data ? payload.data : payload;
    const vragen = (data && data.questions) || [];
    const zoek = (...woorden) => {
      const q = vragen.find(v => woorden.every(w => norm(v.label).includes(w)));
      return q ? q.id : null;
    };
    const id = {
      vn: zoek('voornaam'), an: zoek('achternaam'), em: zoek('mail'),
      sx: zoek('of dame') || zoek('heer of') || zoek('geslacht'), ond: zoek('onderdelen'),
      dJa: zoek('partner voor heren') || zoek('partner voor dames'), dNaam: zoek('dubbelpartner'),
      gJa: zoek('partner voor gemengd'), gNaam: zoek('gemengd partner'),
      bbq: zoek('eet je mee') || zoek('meeeten') || zoek('bbq'), dieet: zoek('dieet'),
    };
    const lijst = (data && data.submissions) || [];
    const spelers = [];
    const gezien = new Set();
    // oudste eerst, zodat bij dubbele inschrijving de nieuwste wint
    [...lijst].sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt))).forEach(s => {
      if (s.isCompleted === false) return;
      const r = {}; (s.responses || []).forEach(x => { r[x.questionId] = x.answer; });
      const tekst = k => { const v = r[id[k]]; return Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v)); };
      const keuzes = k => { const v = r[id[k]]; return Array.isArray(v) ? v.map(String) : (v ? [String(v)] : []); };
      const ond = keuzes('ond').map(norm);
      const vn = tekst('vn').trim(), an = tekst('an').trim();
      if (!vn && !an) return;
      const p = {
        id: norm(vn + ' ' + an).replace(/ /g, '-'),
        vn, an, naam: `${vn} ${an}`.trim(), email: tekst('em'),
        sexe: norm(tekst('sx')).startsWith('d') ? 'D' : 'H',
        E: ond.some(o => o.includes('enkel')), D: ond.some(o => o.includes('heren') || o.includes('dames')), G: ond.some(o => o.includes('gemengd')),
        dHeeft: id.dJa && r[id.dJa] ? norm(tekst('dJa')) === 'ja' : null, dNaam: tekst('dNaam'),
        gHeeft: id.gJa && r[id.gJa] ? norm(tekst('gJa')) === 'ja' : null, gNaam: tekst('gNaam'),
        eet: norm(tekst('bbq')) === 'ja', dieet: tekst('dieet'), ingediend: s.submittedAt,
      };
      if (gezien.has(p.id)) { const i = spelers.findIndex(x => x.id === p.id); spelers[i] = p; } else { gezien.add(p.id); spelers.push(p); }
    });
    return spelers;
  }

  // ---------- partnernamen herkennen ----------
  function herken(tekst, kandidaten, alle) {
    const n = norm(tekst);
    if (!n || ['nog geen', 'geen', 'onbekend', 'nvt', 'n v t'].includes(n) || n.length < 2) return { status: 'leeg' };
    const zoekIn = lijst => {
      let x = lijst.filter(p => norm(p.naam) === n);
      if (x.length === 1) return { id: x[0].id, zeker: true };
      x = lijst.filter(p => norm(p.vn) === n);
      if (x.length === 1) return { id: x[0].id, zeker: false, reden: `alleen de voornaam "${tekst.trim()}" opgegeven` };
      let best = null, bd = 99, dubbel = false;
      lijst.forEach(p => { const d = lev(norm(p.naam), n); if (d < bd) { bd = d; best = p; dubbel = false; } else if (d === bd) dubbel = true; });
      if (best && bd <= 2 && !dubbel) return { id: best.id, zeker: false, reden: `"${tekst.trim()}" lijkt op ${best.naam}` };
      return null;
    };
    const k = zoekIn(kandidaten); if (k) return { status: 'gevonden', ...k };
    const a = zoekIn(alle); if (a) return { status: 'speelt-niet', ...a };
    return { status: 'onbekend' };
  }

  // ---------- partners per dubbelonderdeel ----------
  function bouwKoppels(d, spelers, niveau, besl) {
    const od = ONDERDELEN[d];
    const meldingen = [], voorstellen = [], koppels = [];
    const deel = spelers.filter(p => od.veld === 'D' ? (p.D && p.sexe === od.sexe) : p.G);
    const byId = Object.fromEntries(spelers.map(p => [p.id, p]));
    const naamVan = id => byId[id] ? byId[id].naam : id;
    const claim = {};
    deel.forEach(p => {
      const heeft = od.veld === 'D' ? p.dHeeft : p.gHeeft;
      const tekst = od.veld === 'D' ? p.dNaam : p.gNaam;
      if (!heeft) { claim[p.id] = null; return; }
      const kand = deel.filter(q => q.id !== p.id && (od.type === 'gemengd' ? q.sexe !== p.sexe : true));
      const h = herken(tekst, kand, spelers.filter(q => q.id !== p.id));
      if (h.status === 'gevonden') {
        if (!h.zeker) {
          const key = `${d}|${p.id}|${h.id}`;
          const st = (besl.partners || {})[key] || 'open';
          voorstellen.push({ key, d, van: p.id, naar: h.id, reden: h.reden, status: st });
          if (st === 'afwijzen') { claim[p.id] = { fout: `${p.naam}: opgegeven partner "${tekst}" afgewezen` }; return; }
        }
        claim[p.id] = { id: h.id };
      } else if (h.status === 'speelt-niet') {
        claim[p.id] = { fout: `${p.naam} noemt ${naamVan(h.id)} als partner, maar ${naamVan(h.id)} speelt geen ${od.naam.toLowerCase()}` };
      } else if (h.status === 'onbekend') {
        claim[p.id] = { fout: `${p.naam} noemt "${tekst}" als partner, maar die naam staat niet bij de inschrijvingen` };
      } else {
        claim[p.id] = { fout: `${p.naam} gaf aan een partner te hebben, maar vulde geen naam in` };
      }
    });
    const bezet = new Set();
    // handmatige koppels van de organisatie gaan voor alles
    // alleen spelers die zich zelf voor dit onderdeel inschreven, mogen gekoppeld worden
    const ingeschreven = new Set(deel.map(p => p.id));
    ((besl.handKoppels || {})[d] || []).forEach(([a, b]) => {
      if (!byId[a] || !byId[b] || a === b || bezet.has(a) || bezet.has(b)) return;
      const niet = [a, b].filter(x => !ingeschreven.has(x));
      if (niet.length) {
        meldingen.push({ niveau: 'let-op', soort: 'handkoppel', speler: a, tekst: `De handmatige koppeling ${naamVan(a)} / ${naamVan(b)} vervalt: ${niet.map(naamVan).join(' en ')} schreef zich niet in voor ${od.naam.toLowerCase()}.` });
        return;
      }
      if (od.type === 'gemengd' && byId[a].sexe === byId[b].sexe) return;
      koppels.push({ a, b, soort: 'handmatig' }); bezet.add(a); bezet.add(b);
    });
    deel.forEach(p => {
      if (bezet.has(p.id)) return;
      const c = claim[p.id];
      if (!c) return;
      if (c.fout) { meldingen.push({ niveau: 'let-op', speler: p.id, soort: 'partneropgave', tekst: c.fout + ' – staat nu bij de partnerzoekers.' }); return; }
      const q = c.id;
      if (bezet.has(q)) { meldingen.push({ niveau: 'let-op', speler: p.id, soort: 'partneropgave', tekst: `${p.naam} noemt ${naamVan(q)}, maar die staat al in een ander koppel – ${p.naam} staat nu bij de partnerzoekers.` }); return; }
      const cq = claim[q];
      if (cq && cq.id === p.id) { koppels.push({ a: p.id, b: q, soort: 'opgegeven' }); bezet.add(p.id); bezet.add(q); return; }
      if (cq && cq.id && cq.id !== p.id) {
        if (claim[cq.id] && claim[cq.id].id === q) return; // q zit al met een ander, p wordt zoeker (melding volgt later)
        meldingen.push({ niveau: 'let-op', speler: p.id, soort: 'partneropgave', tekst: `${p.naam} noemt ${naamVan(q)}, maar ${naamVan(q)} noemt ${naamVan(cq.id)}. Controleer dit.` });
        return;
      }
      const waarom = cq && cq.fout ? 'de partneropgave van ' + naamVan(q) + ' klopte niet' : naamVan(q) + ' gaf zelf geen partner op';
      koppels.push({ a: p.id, b: q, soort: 'opgegeven', notitie: waarom });
      meldingen.push({ niveau: 'info', speler: p.id, soort: 'partneropgave', tekst: `${p.naam} noemt ${naamVan(q)}, maar ${waarom}. Ze zijn als koppel ingedeeld.` });
      bezet.add(p.id); bezet.add(q);
    });
    // partnerzoekers koppelen op niveau
    const niv = id => niveau[id] || 3;
    const zoekers = deel.filter(p => !bezet.has(p.id)).sort((x, y) => niv(y.id) - niv(x.id) || x.naam.localeCompare(y.naam));
    const over = [];
    if (od.type === 'gemengd') {
      const h = zoekers.filter(p => p.sexe === 'H'), v = zoekers.filter(p => p.sexe === 'D');
      for (let i = 0; i < Math.max(h.length, v.length); i++) {
        if (h[i] && v[i]) koppels.push({ a: h[i].id, b: v[i].id, soort: 'automatisch' });
        else over.push((h[i] || v[i]).id);
      }
    } else {
      for (let i = 0; i < zoekers.length; i += 2) {
        if (zoekers[i + 1]) koppels.push({ a: zoekers[i].id, b: zoekers[i + 1].id, soort: 'automatisch' });
        else over.push(zoekers[i].id);
      }
    }
    over.forEach(id => meldingen.push({ niveau: 'probleem', speler: id, soort: 'geenpartner', tekst: `${naamVan(id)} heeft geen partner voor ${od.naam.toLowerCase()} en er is geen andere zoeker over.` }));
    return { koppels, over, meldingen, voorstellen };
  }

  // ---------- eenheden (speler of koppel) ----------
  function eenheden(d, spelers, niveau, partnerInfo) {
    const od = ONDERDELEN[d];
    const byId = Object.fromEntries(spelers.map(p => [p.id, p]));
    const niv = id => niveau[id] || 3;
    if (od.type === 'enkel') {
      return spelers.filter(p => p.E && p.sexe === od.sexe)
        .map(p => ({ id: p.id, leden: [p.id], naam: p.naam, niveau: niv(p.id) }));
    }
    return partnerInfo[d].koppels.map(k => ({
      id: `${k.a}+${k.b}`, leden: [k.a, k.b], naam: `${byId[k.a].naam} / ${byId[k.b].naam}`,
      niveau: (niv(k.a) + niv(k.b)) / 2, soort: k.soort,
    }));
  }

  const klasseVan = (niv, K) => Math.min(K - 1, Math.max(0, Math.floor((5 - niv) / (4 / K) + 1e-9)));

  // ---------- klassen indelen + voorstellen ----------
  function indelen(d, units, inst, besl) {
    const cfg = inst.onderdelen[d];
    const K = Math.max(1, Math.min(4, cfg.klassen || 1));
    const namen = KLASSEN[K];
    const over = (besl.klasse || {});
    const klassen = namen.map((n, i) => ({ idx: i, naam: n, units: [] }));
    units.forEach(u => {
      const o = over[`${d}|${u.id}`];
      const i = (o != null && o < K) ? o : klasseVan(u.niveau, K);
      u.klasseAuto = klasseVan(u.niveau, K);
      klassen[i].units.push(u);
    });
    klassen.forEach(k => k.units.sort((a, b) => b.niveau - a.niveau || a.naam.localeCompare(b.naam)));
    const minP = inst.minPoule, maxP = inst.maxPoule;
    const problemen = [];
    if (cfg.vorm === 'knockout') return { klassen, problemen, K };
    klassen.forEach((k, i) => {
      const n = k.units.length;
      if (n > 0 && n < minP && K > 1) {
        const buren = [i - 1, i + 1].filter(j => j >= 0 && j < K);
        // voorkeur: buur met de meeste spelers
        buren.sort((a, b) => klassen[b].units.length - klassen[a].units.length);
        const opties = [];
        buren.forEach(j => {
          const nodig = minP - n;
          const buur = klassen[j];
          if (buur.units.length - nodig >= minP) {
            // spelers het dichtst bij de grens: uit hogere klasse de zwakste, uit lagere de sterkste
            const kand = j < i ? buur.units.slice(-nodig) : buur.units.slice(0, nodig);
            opties.push({ soort: 'aanvullen', van: j, naar: i, units: kand.map(u => u.id), namen: kand.map(u => u.naam) });
          }
          opties.push({ soort: 'samenvoegen', van: i, naar: j, units: k.units.map(u => u.id), namen: k.units.map(u => u.naam) });
        });
        problemen.push({ d, klasse: i, soort: 'klein', tekst: `${ONDERDELEN[d].naam} ${k.naam} heeft ${n} ${n === 1 ? 'deelnemer' : 'deelnemers'} (minimaal ${minP}).`, opties });
      }
      if (n > maxP && cfg.vorm === 'poule' && K > 1) {
        const opties = [];
        let teveel = n - maxP;
        [i - 1, i + 1].filter(j => j >= 0 && j < K).forEach(j => {
          const ruimte = maxP - klassen[j].units.length;
          const aantal = Math.min(teveel, ruimte);
          if (aantal > 0) {
            const kand = j < i ? k.units.slice(0, aantal) : k.units.slice(-aantal);
            opties.push({ soort: j < i ? 'omhoog' : 'omlaag', van: i, naar: j, units: kand.map(u => u.id), namen: kand.map(u => u.naam) });
          }
        });
        problemen.push({ d, klasse: i, soort: 'groot', tekst: `${ONDERDELEN[d].naam} ${k.naam} heeft ${n} deelnemers (maximaal ${maxP} per poule). Zonder aanpassing wordt de klasse in tweeën gesplitst.`, opties });
      }
    });
    return { klassen, problemen, K };
  }

  // ---------- poules en wedstrijden ----------
  function roundRobin(ids) {
    const lijst = [...ids]; if (lijst.length % 2) lijst.push(null);
    const n = lijst.length, rondes = [];
    for (let r = 0; r < n - 1; r++) {
      const ronde = [];
      for (let i = 0; i < n / 2; i++) { const a = lijst[i], b = lijst[n - 1 - i]; if (a != null && b != null) ronde.push([a, b]); }
      rondes.push(ronde);
      lijst.splice(1, 0, lijst.pop());
    }
    return rondes;
  }

  function maakToernooi(spelers, niveau, inst, besl) {
    const meldingen = [];
    const partnerInfo = {};
    ['HD', 'DD', 'GD'].forEach(d => { partnerInfo[d] = bouwKoppels(d, spelers, niveau, besl); });
    const byId = Object.fromEntries(spelers.map(p => [p.id, p]));
    const groepen = [], wedstrijden = [];
    const indeling = {};
    VOLGORDE.forEach(d => {
      const cfg = inst.onderdelen[d];
      if (!cfg || !cfg.actief) return;
      if (partnerInfo[d]) meldingen.push(...partnerInfo[d].meldingen.map(m => ({ ...m, d })));
      const units = eenheden(d, spelers, niveau, partnerInfo);
      const ind = indelen(d, units, inst, besl);
      indeling[d] = ind;
      if (units.length < 2) {
        if (units.length) meldingen.push({ niveau: 'probleem', d, tekst: `${ONDERDELEN[d].naam} heeft maar 1 deelnemer en wordt niet gespeeld.` });
        return;
      }
      // klassen die te klein zijn automatisch samenvoegen (alleen als er geen keuze is gemaakt)
      let klassen = ind.klassen.map(k => ({ ...k, units: [...k.units] }));
      if (cfg.vorm !== 'knockout') {
        let veranderd = true;
        while (veranderd) {
          veranderd = false;
          const actief = klassen.filter(k => k.units.length);
          if (actief.length <= 1) break;
          for (const k of actief) {
            if (k.units.length < inst.minPoule) {
              const i = klassen.indexOf(k);
              const buren = [i - 1, i + 1].filter(j => j >= 0 && j < klassen.length && klassen[j].units.length);
              let j = buren.sort((a, b) => klassen[b].units.length - klassen[a].units.length)[0];
              if (j == null) { // geen directe buur met spelers: zoek dichtstbijzijnde
                j = klassen.map((x, xi) => xi).filter(xi => xi !== i && klassen[xi].units.length).sort((a, b) => Math.abs(a - i) - Math.abs(b - i))[0];
              }
              if (j == null) break;
              const doel = klassen[j];
              doel.units.push(...k.units); doel.units.sort((a, b) => b.niveau - a.niveau);
              doel.naam = j < i ? `${doel.naam}/${k.naam}` : `${k.naam}/${doel.naam}`;
              meldingen.push({ niveau: 'let-op', d, tekst: `${ONDERDELEN[d].naam}: klasse ${k.naam} is te klein en tijdelijk samengevoegd tot ${doel.naam}. Kies een oplossing bij Klassen.` });
              k.units = []; veranderd = true; break;
            }
          }
        }
      }
      klassen.filter(k => k.units.length >= 2).forEach(k => {
        const basis = { d, klasse: k.naam };
        const n = k.units.length;
        if (cfg.vorm === 'knockout') {
          maakKnockout(basis, k.units, groepen, wedstrijden);
          return;
        }
        const aantalPoules = n > inst.maxPoule ? Math.ceil(n / inst.maxPoule) : 1;
        const poules = Array.from({ length: aantalPoules }, () => []);
        if (cfg.vorm === 'poule') {
          // opsplitsen op niveau: sterkste groep eerst, elk eigen kampioen
          const grootte = Math.ceil(n / aantalPoules);
          k.units.forEach((u, i) => poules[Math.min(aantalPoules - 1, Math.floor(i / grootte))].push(u));
          if (aantalPoules > 1) meldingen.push({ niveau: 'let-op', d, tekst: `${ONDERDELEN[d].naam} ${k.naam} (${n} deelnemers) is gesplitst in ${aantalPoules} poules op niveau, elk met een eigen kampioen.` });
        } else {
          // slangsgewijs verdelen voor gelijke poules
          k.units.forEach((u, i) => { const r = Math.floor(i / aantalPoules); const p = r % 2 ? aantalPoules - 1 - (i % aantalPoules) : i % aantalPoules; poules[p].push(u); });
        }
        const pouleIds = [];
        poules.forEach((pu, pi) => {
          const label = aantalPoules === 1 ? `${k.naam}` : (cfg.vorm === 'poule' ? `${k.naam} · ${pi + 1}` : `${k.naam} poule ${pi + 1}`);
          const g = { id: `${d}-${label}`.replace(/\s+/g, '_'), ...basis, label, units: pu, soort: 'poule' };
          groepen.push(g); pouleIds.push(g.id);
          roundRobin(pu.map(u => u.id)).forEach((ronde, ri) => ronde.forEach(([a, b]) => {
            const ua = pu.find(u => u.id === a), ub = pu.find(u => u.id === b);
            wedstrijden.push({ id: `${g.id}#${wedstrijden.length}`, groep: g.id, d, ronde: ri, a: ua, b: ub, spelers: [...ua.leden, ...ub.leden], deps: [] });
          }));
        });
        if (cfg.vorm === 'poulefinale' && aantalPoules > 1) maakFinales(basis, k.naam, pouleIds, groepen, wedstrijden);
      });
      // na samenvoegen of opsplitsen: poules opnieuw benoemen als A, B, C… van sterk naar minder sterk
      if (cfg.vorm === 'poule') {
        const eigen = groepen.filter(g => g.d === d && g.soort === 'poule');
        if (eigen.some(g => /[\/·]/.test(g.label))) {
          eigen.forEach((g, i) => { g.oorspronkelijk = g.label; g.label = 'ABCDEFGH'[i] || String(i + 1); g.klasse = g.label; });
          meldingen.push({ niveau: 'info', d, tekst: `${ONDERDELEN[d].naam}: na samenvoegen/opsplitsen heten de poules ${eigen.map(g => g.label).join(', ')} (van sterk naar minder sterk).` });
        }
      }
    });
    return { groepen, wedstrijden, meldingen, partnerInfo, indeling, byId };
  }

  function plek(tekst, token) { return { naam: tekst, leden: token ? [token] : [], placeholder: true }; }

  function maakFinales(basis, kNaam, pouleIds, groepen, wedstrijden) {
    const P = pouleIds.length;
    const deps = wedstrijden.filter(w => pouleIds.includes(w.groep)).map(w => w.id);
    const g = { id: `${basis.d}-${kNaam}-finale`.replace(/\s+/g, '_'), ...basis, label: `${kNaam} finales`, units: [], soort: 'finale' };
    groepen.push(g);
    const W = i => plek(`Winnaar poule ${i + 1}`, `~${g.id}~${i}`);
    const add = (a, b, ronde, dps, titel) => { const w = { id: `${g.id}#${wedstrijden.length}`, groep: g.id, d: basis.d, ronde, a, b, spelers: [...a.leden, ...b.leden], deps: dps, titel }; wedstrijden.push(w); return w; };
    if (P === 2) add(W(0), W(1), 0, deps, 'Finale');
    else if (P === 4) {
      const h1 = add(W(0), W(3), 0, deps, 'Halve finale 1'), h2 = add(W(1), W(2), 0, deps, 'Halve finale 2');
      add(plek('Winnaar HF1', '~' + h1.id), plek('Winnaar HF2', '~' + h2.id), 1, [h1.id, h2.id], 'Finale');
    } else {
      roundRobin([...Array(P).keys()]).forEach((ronde, ri) => ronde.forEach(([a, b]) => add(W(a), W(b), ri, deps, 'Finalepoule')));
    }
  }

  function maakKnockout(basis, units, groepen, wedstrijden) {
    const g = { id: `${basis.d}-${basis.klasse}-ko`.replace(/\s+/g, '_'), ...basis, label: `${basis.klasse} knock-out`, units, soort: 'knockout' };
    groepen.push(g);
    let size = 1; while (size < units.length) size *= 2;
    let orde = [1]; while (orde.length < size) { const m = orde.length * 2 + 1; orde = orde.flatMap(x => [x, m - x]); }
    let veld = orde.map(s => units[s - 1] ? { unit: units[s - 1] } : null);
    let ronde = 0;
    const rondeNaam = n => n === 2 ? 'Finale' : n === 4 ? 'Halve finale' : n === 8 ? 'Kwartfinale' : `Ronde van ${n}`;
    while (veld.length > 1) {
      const volgende = [];
      for (let i = 0; i < veld.length; i += 2) {
        const x = veld[i], y = veld[i + 1];
        if (x && y) {
          const a = x.unit || plek(x.label, '~' + x.match), b = y.unit || plek(y.label, '~' + y.match);
          const w = { id: `${g.id}#${wedstrijden.length}`, groep: g.id, d: basis.d, ronde, a, b,
            spelers: [...a.leden, ...b.leden],
            deps: [x.match, y.match].filter(Boolean), titel: rondeNaam(veld.length) };
          wedstrijden.push(w);
          volgende.push({ match: w.id, label: `Winnaar ${w.titel.toLowerCase()} ${Math.floor(i / 2) + 1}`, alleKnown: false });
        } else volgende.push(x || y);
      }
      veld = volgende; ronde++;
    }
  }

  // ---------- tijden ----------
  function slotTijden(inst, aantal) {
    const lengte = inst.duur + inst.pauze;
    const ls = toMin(inst.lunchStart), le = ls + inst.lunchDuur;
    const tijden = [];
    let t = toMin(inst.start);
    for (let s = 0; s < aantal; s++) {
      if (inst.lunch && t < le && t + inst.duur > ls) t = le;
      tijden.push(t); t += lengte;
    }
    return tijden;
  }

  // ---------- planning ----------
  function plan(wedstrijden, groepen, inst, modus) {
    const N = Math.max(1, inst.banen), maxAE = Math.max(1, inst.maxAchterElkaar);
    const groepById = Object.fromEntries(groepen.map(g => [g.id, g]));
    const tijden = slotTijden(inst, 400);
    const blok = {};
    if (inst.tijdblokken) Object.entries(inst.onderdelen).forEach(([d, o]) => {
      blok[d] = { van: o.van ? toMin(o.van) : -1, tot: o.tot ? toMin(o.tot) : 99999 };
    });
    const magNu = (w, s) => !blok[w.d] || tijden[s] >= blok[w.d].van;
    const resterendD = {}; wedstrijden.forEach(w => { resterendD[w.d] = (resterendD[w.d] || 0) + 1; });
    const urgentie = (w, s) => {
      if (!blok[w.d] || blok[w.d].tot > 90000) return 0;
      const over = Math.max(1, Math.floor((blok[w.d].tot - tijden[s]) / (inst.duur + inst.pauze)));
      return Math.min(30, (resterendD[w.d] / (over * N)) * 20);
    };
    // thuisbanen
    const telling = {}; wedstrijden.forEach(w => { telling[w.groep] = (telling[w.groep] || 0) + 1; });
    const last = Array(N).fill(0);
    [...groepen].sort((a, b) => (telling[b.id] || 0) - (telling[a.id] || 0)).forEach(g => {
      let c = 0; for (let i = 1; i < N; i++) if (last[i] < last[c]) c = i;
      g.thuisbaan = c; last[c] += telling[g.id] || 0;
    });
    const resterend = {}; wedstrijden.forEach(w => { resterend[w.groep] = (resterend[w.groep] || 0) + 1; });
    const spelerRest = {}; wedstrijden.forEach(w => w.spelers.forEach(p => { spelerRest[p] = (spelerRest[p] || 0) + 1; }));
    const laatsteSlot = {}, reeks = {}, laatsteBaan = {};
    const gepland = new Map(); // id -> {slot, baan}
    const open = new Set(wedstrijden.map(w => w.id));
    const byId = Object.fromEntries(wedstrijden.map(w => [w.id, w]));
    const slots = [];
    let s = 0;
    while (open.size && s < 400) {
      const klaar = [...open].map(id => byId[id]).filter(w => magNu(w, s) && w.deps.every(dep => gepland.has(dep) && gepland.get(dep).slot <= s - 2));
      const score = w => {
        const rust = w.spelers.length ? Math.min(...w.spelers.map(p => laatsteSlot[p] == null ? 8 : s - laatsteSlot[p])) : 8;
        const druk = w.spelers.length ? Math.max(...w.spelers.map(p => spelerRest[p] || 0)) : 0;
        const achter = w.spelers.some(p => laatsteSlot[p] === s - 1);
        return (resterend[w.groep] || 0) * 1.5 + druk * 2 + Math.min(rust, 6) * 2.5 - (achter ? 3 : 0) - w.ronde * 0.3 + urgentie(w, s);
      };
      const overschrijdt = w => w.spelers.some(p => laatsteSlot[p] === s - 1 && (reeks[p] || 0) >= maxAE);
      klaar.sort((a, b) => score(b) - score(a));
      const gekozen = [], bezet = new Set();
      const probeer = (toestaan) => {
        for (const w of klaar) {
          if (gekozen.length >= N) break;
          if (gekozen.includes(w)) continue;
          if (w.spelers.some(p => bezet.has(p))) continue;
          if (!toestaan && overschrijdt(w)) continue;
          gekozen.push(w); w.spelers.forEach(p => bezet.add(p));
        }
      };
      // niveau 0: niemand speelde net; 1: achter elkaar maar binnen de voorkeur; 2: overschrijding
      const achterNu = w => w.spelers.some(p => laatsteSlot[p] === s - 1);
      const probeerNiveau = (fn) => {
        for (const w of klaar) {
          if (gekozen.length >= N) break;
          if (gekozen.includes(w) || !fn(w)) continue;
          if (w.spelers.some(p => bezet.has(p))) continue;
          gekozen.push(w); w.spelers.forEach(p => bezet.add(p));
        }
      };
      probeerNiveau(w => !achterNu(w));
      if (modus !== 'rustig' || gekozen.length < Math.ceil(N / 2)) probeerNiveau(w => achterNu(w) && !overschrijdt(w));
      // alleen in de variant 'ruim' mag de voorkeur voor maximaal achter elkaar wijken; anders blijft een baan liever even leeg
      if (modus === 'ruim') probeer(true);
      // banen toewijzen
      const vrij = new Set([...Array(N).keys()]);
      const toewijzing = [];
      const paren = [];
      gekozen.forEach(w => {
        const g = groepById[w.groep];
        for (let c = 0; c < N; c++) {
          let sc = 0;
          w.spelers.forEach(p => {
            if (laatsteBaan[p] === c && laatsteSlot[p] === s - 1) sc += 10;
            else if (laatsteBaan[p] === c) sc += 1.5;
            else if (laatsteBaan[p] != null && laatsteSlot[p] === s - 1) sc -= Math.abs(laatsteBaan[p] - c) * 0.8;
          });
          if (g.thuisbaan === c) sc += 4;
          sc -= Math.abs(g.thuisbaan - c) * 0.3;
          paren.push({ w, c, sc });
        }
      });
      paren.sort((a, b) => b.sc - a.sc);
      const klaarW = new Set();
      paren.forEach(({ w, c }) => { if (klaarW.has(w.id) || !vrij.has(c)) return; klaarW.add(w.id); vrij.delete(c); toewijzing.push({ w, baan: c }); });
      const slot = Array(N).fill(null);
      toewijzing.forEach(({ w, baan }) => {
        slot[baan] = w.id;
        gepland.set(w.id, { slot: s, baan });
        open.delete(w.id); resterend[w.groep]--; resterendD[w.d]--;
        w.spelers.forEach(p => {
          reeks[p] = laatsteSlot[p] === s - 1 ? (reeks[p] || 0) + 1 : 1;
          laatsteSlot[p] = s; laatsteBaan[p] = baan; spelerRest[p]--;
        });
      });
      slots.push(slot);
      s++;
    }
    while (slots.length && slots[slots.length - 1].every(x => x == null)) slots.pop();
    return { slots, gepland };
  }

  function analyseer(res, wedstrijden, inst, byIdSpeler) {
    const tijden = slotTijden(inst, res.slots.length);
    const perSpeler = {};
    const wById = Object.fromEntries(wedstrijden.map(w => [w.id, w]));
    res.slots.forEach((slot, s) => slot.forEach((id, baan) => {
      if (!id) return; const w = wById[id];
      w.spelers.filter(p => !String(p).startsWith('~')).forEach(p => { (perSpeler[p] = perSpeler[p] || []).push({ s, baan, id }); });
    }));
    const overschrijdingen = [];
    const stats = {};
    Object.entries(perSpeler).forEach(([p, lijst]) => {
      lijst.sort((a, b) => a.s - b.s);
      let reeks = 1, maxReeks = 1, wissels = 0, achterElkaar = 0, langsteWacht = 0;
      for (let i = 1; i < lijst.length; i++) {
        if (lijst[i].s === lijst[i - 1].s + 1) { reeks++; achterElkaar++; if (lijst[i].baan !== lijst[i - 1].baan) wissels++; }
        else { reeks = 1; langsteWacht = Math.max(langsteWacht, lijst[i].s - lijst[i - 1].s - 1); }
        maxReeks = Math.max(maxReeks, reeks);
      }
      stats[p] = { aantal: lijst.length, maxReeks, wissels, achterElkaar, langsteWacht, eerste: lijst[0].s, laatste: lijst[lijst.length - 1].s };
      if (maxReeks > inst.maxAchterElkaar) overschrijdingen.push({ speler: p, maxReeks });
    });
    const laatste = tijden.length ? tijden[tijden.length - 1] + inst.duur : toMin(inst.start);
    return { tijden, perSpeler, stats, overschrijdingen, eindeSpel: laatste, eindeDag: laatste + inst.prijsuitreiking };
  }

  function volledig(spelers, niveau, instIn, besl) {
    let inst = instIn;
    const t = maakToernooi(spelers, niveau, inst, besl);
    let modus = inst.eindModus === 'auto' ? 'start' : inst.eindModus === 'vast' ? 'venster' : inst.eindModus;
    const blokMelding = [];
    if (inst.tijdblokken && modus === 'eind') { modus = 'start'; blokMelding.push({ niveau: 'let-op', tekst: 'Met tijdblokken per onderdeel liggen de tijden vast. "Eindtijd leidend" wordt daarom behandeld als "begintijd leidend".' }); }
    inst = { ...inst, eindModus: modus };
    // drie varianten: rustig (meeste rust), krap (voorkeur altijd gerespecteerd), ruim (banen zo vol mogelijk)
    const varianten = ['rustig', 'krap', 'ruim'].map(m => ({ m, r: plan(t.wedstrijden, t.groepen, inst, m) }));
    const eindeVan = r => { const tt = slotTijden(inst, r.slots.length); return (tt.length ? tt[tt.length - 1] + inst.duur : toMin(inst.start)) + inst.prijsuitreiking; };
    let kies = null;
    if (modus === 'venster') {
      const grens = toMin(inst.eind);
      // ruimte over? speel dan op zo min mogelijk banen tegelijk: dat geeft meer rust tussen wedstrijden
      for (let k = 1; k <= inst.banen && !kies; k++) {
        const r = plan(t.wedstrijden, t.groepen, { ...inst, banen: k }, 'rustig');
        if (eindeVan(r) <= grens) { r.slots = r.slots.map(sl => [...sl, ...Array(inst.banen - k).fill(null)]); r.gespreid = k < inst.banen ? k : null; kies = r; }
      }
      if (!kies) kies = (varianten.find(v => eindeVan(v.r) <= grens) || varianten[2]).r;
    } else {
      // zonder vaste eindtijd is er geen reden om de rustvoorkeur los te laten: kies rustig, anders krap
      const kortst = Math.min(varianten[0].r.slots.length, varianten[1].r.slots.length);
      kies = (varianten[0].r.slots.length <= Math.ceil(kortst * 1.2) + 1 ? varianten[0] : varianten[1]).r;
    }
    let berekendeStart = null;
    if (modus === 'eind') {
      // terugrekenen vanaf de eindtijd; herhalen omdat een lunchpauze kan verschuiven
      const doel = toMin(inst.eind);
      let start = toMin(inst.start);
      for (let i = 0; i < 6; i++) {
        const proef = { ...inst, start: toTijd(start) };
        const tt = slotTijden(proef, kies.slots.length);
        const einde = (tt.length ? tt[tt.length - 1] + inst.duur : start) + inst.prijsuitreiking;
        const nieuw = Math.floor((start + doel - einde) / 5) * 5;
        if (nieuw === start) break;
        start = nieuw;
      }
      berekendeStart = toTijd(start);
      inst = { ...inst, start: berekendeStart };
    }
    const an = analyseer(kies, t.wedstrijden, inst, t.byId);
    const meldingen = [...blokMelding, ...t.meldingen];
    an.overschrijdingen.forEach(o => meldingen.push({ niveau: 'let-op', tekst: `${t.byId[o.speler] ? t.byId[o.speler].naam : o.speler} speelt ${o.maxReeks} wedstrijden direct achter elkaar (voorkeur: maximaal ${inst.maxAchterElkaar}).` }));
    if (inst.tijdblokken) {
      const wById = Object.fromEntries(t.wedstrijden.map(w => [w.id, w]));
      const buiten = {};
      kies.slots.forEach((sl, si) => sl.forEach(id => {
        if (!id) return; const w = wById[id], o = inst.onderdelen[w.d];
        if (o && o.tot && an.tijden[si] + inst.duur > toMin(o.tot)) buiten[w.d] = Math.max(buiten[w.d] || 0, an.tijden[si] + inst.duur);
      }));
      Object.entries(buiten).forEach(([d, eind]) => meldingen.unshift({ niveau: 'probleem', d, tekst: `${ONDERDELEN[d].naam} past niet in het tijdblok tot ${inst.onderdelen[d].tot}: de laatste wedstrijd is pas om ${toTijd(eind)} klaar.` }));
    }
    if (kies.gespreid) meldingen.push({ niveau: 'info', tekst: `Er is tijd over binnen het tijdvak: er worden steeds maximaal ${kies.gespreid} van de ${inst.banen} banen tegelijk gebruikt, zodat iedereen meer rust heeft.` });
    let overloop = 0;
    if (modus === 'venster') {
      overloop = an.eindeDag - toMin(inst.eind);
      if (overloop > 0) meldingen.unshift({ niveau: 'probleem', tekst: `Het toernooi loopt ${overloop} minuten uit ten opzichte van de eindtijd ${inst.eind}.` });
    }
    return { ...t, planning: kies, analyse: an, meldingen, overloop, modus, start: inst.start, berekendeStart };
  }

  return { ONDERDELEN, VOLGORDE, KLASSEN, STANDAARD, leesTally, herken, maakToernooi, plan, analyseer, volledig, slotTijden, toMin, toTijd, klasseVan, indelen, eenheden, bouwKoppels, norm };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
