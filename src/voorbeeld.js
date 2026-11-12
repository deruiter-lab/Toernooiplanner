// Voorbeeldgegevens: de 35 fictieve testinschrijvingen (zelfde vorm als Tally fetch_submissions)
const VOORBEELD = (() => {
  const Q = [
    ["WlqB0R", "Voornaam"], ["aZzgG2", "Achternaam"], ["6rPyxN", "E-mailadres"], ["74EzZ2", "Here of dame?"],
    ["bNzyO7", "Aan welke onderdelen doe je mee?"], ["AW9G8l", "Heb je al een partner voor heren-/damesdubbel?"],
    ["B8elB1", "Voor- en achternaam van je dubbelpartner"], ["kOz1ZZ", "Heb je al een partner voor gemengd dubbel?"],
    ["vqz124", "Voor- en achternaam van je gemengd-partner"], ["K8GZ0D", "Eet je mee met de bbq?"], ["L5ON0J", "Dieetwensen"],
  ];
  // vn, an, sexe, enkel, dubbel(null=niet, ''=zoekt, naam), gemengd, dieet(null=eet niet mee), niveau
  const P = [
    ['Mark', 'de Vries', 'H', 1, 'Peter Jansen', 'Lisa Bakker', 'Geen', 5], ['Peter', 'Jansen', 'H', 0, 'Mark', 'Anouk Smit', 'Geen', 4],
    ['Tom', 'Hendriks', 'H', 1, 'Bas Willems', 'Eva Mulder', 'Geen', 4], ['Bas', 'Willems', 'H', 1, 'Tom Hendriks', null, 'Geen', 3],
    ['Rick', 'van Dijk', 'H', 1, null, '', 'Geen', 3], ['Joost', 'Meijer', 'H', 1, 'Daan Bos', 'Iris de Graaf', 'Vegetarisch', 5],
    ['Daan', 'Bos', 'H', 0, 'Joost Meijer', null, null, 4], ['Kevin', 'Peters', 'H', 1, null, null, 'Geen', 2],
    ['Sven', 'Kok', 'H', 1, 'Jeroen Brouwer', 'Nienke Dekker', 'Geen', 3], ['Jeroen', 'Brouwer', 'H', 1, 'Sven Kok', null, 'Halal', 3],
    ['Thijs', 'van Leeuwen', 'H', 1, '', null, 'Geen', 2], ['Niels', 'Koster', 'H', 1, 'Ruben Smits', 'Laura Hoekstra', 'Geen', 4],
    ['Ruben', 'Smits', 'H', 0, 'Niels Koster', 'Joyce Bosman', 'Geen varkensvlees', 2], ['Wouter', 'de Boer', 'H', 1, 'Martijn Huisman', 'Kim Prins', 'Geen', 3],
    ['Martijn', 'Huisman', 'H', 0, 'Wouter de Boer', 'Ilse Schouten', 'Glutenvrij', 2], ['Lars', 'Postma', 'H', 1, '', '', 'Geen', 1],
    ['Erik', 'van der Berg', 'H', 0, '', null, null, 1], ['Gerrit', 'Jacobs', 'H', 1, 'Kevin Peters', null, '-', 2],
    ['Jan', 'Mol', 'H', 1, '', null, 'Geen', 3],
    ['Lisa', 'Bakker', 'D', 1, 'Sanne Visser', 'Mark de Vries', 'Vegetarisch', 5], ['Sanne', 'Visser', 'D', 1, 'Lisa Bakker', null, 'Geen', 4],
    ['Anouk', 'Smit', 'D', 0, 'Eva Mulder', 'Peter Jansen', null, 3], ['Eva', 'Mulder', 'D', 1, 'Anouk Smit', 'Tom Hendriks', 'Glutenvrij', 4],
    ['Femke', 'de Jong', 'D', 0, '', null, 'Lactose-intolerant', 2], ['Iris', 'de Graaf', 'D', 1, '', 'Joost Meijer', 'Vegan', 4],
    ['Marloes', 'Vermeulen', 'D', 1, 'Nienke Dekker', '', 'Geen', 3], ['Nienke', 'Dekker', 'D', 0, 'Marloes Vermeulen', 'Sven Kok', 'Pinda-allergie!', 3],
    ['Sophie', 'Kuipers', 'D', 1, null, null, null, 2], ['Laura', 'Hoekstra', 'D', 1, 'Esther van Wijk', 'Niels Koster', 'Geen', 3],
    ['Esther', 'van Wijk', 'D', 0, 'Laura Hoekstra', '', 'Vegetarisch, geen vis', 2], ['Kim', 'Prins', 'D', 1, 'Joyce Bosman', 'Wouter de Boer', 'Geen', 2],
    ['Joyce', 'Bosman', 'D', 0, 'Kim Prins', 'Ruben Smit', 'Geen', 1], ['Mirjam', 'de Haan', 'D', 1, '', null, 'Geen', 1],
    ['Ilse', 'Schouten', 'D', 1, null, 'Martijn Huisman', 'Geen', 3], ['Anna', 'Wolters', 'D', 1, '', null, 'Geen', 2],
  ];
  const niveaus = {};
  const submissions = P.map(([vn, an, sx, en, db, gm, dt, niv], i) => {
    const ond = [en && 'Enkel', db !== null && 'Heren- of damesdubbel', gm !== null && 'Gemengd dubbel'].filter(Boolean);
    const r = [
      ['WlqB0R', vn], ['aZzgG2', an], ['6rPyxN', (vn + '.' + an).toLowerCase().replace(/\s+/g, '') + '@example.com'],
      ['74EzZ2', [sx === 'H' ? 'Heer' : 'Dame']], ['bNzyO7', ond],
    ];
    if (db !== null) { r.push(['AW9G8l', [db ? 'Ja' : 'Nee']]); if (db) r.push(['B8elB1', db]); }
    if (gm !== null) { r.push(['kOz1ZZ', [gm ? 'Ja' : 'Nee']]); if (gm) r.push(['vqz124', gm]); }
    r.push(['K8GZ0D', [dt !== null ? 'Ja' : 'Nee']]); if (dt !== null) r.push(['L5ON0J', dt]);
    niveaus[(vn + ' ' + an).toLowerCase().replace(/ /g, '-')] = niv;
    return { id: 'voorbeeld' + i, isCompleted: true, submittedAt: `2026-11-12T20:${String(15 + Math.floor(i / 6)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}.000Z`, responses: r.map(([questionId, answer]) => ({ questionId, answer })) };
  });
  return { payload: { data: { questions: Q.map(([id, label]) => ({ id, label })), submissions } }, niveaus };
})();
if (typeof module !== 'undefined') module.exports = VOORBEELD;
