# Toernooiplanner clubkampioenschappen

Planningstool voor de jaarlijkse clubkampioenschappen badminton met aansluitende bbq. De tool haalt de inschrijvingen op uit Tally, helpt de organisatie stap voor stap naar een sluitende planning en maakt per speler een overzicht van de speeltijden.

## Stappenplan

1. **Inschrijvingen**: nieuwe en gewijzigde aanmeldingen, partnernamen die niet precies kloppen, ontbrekende gegevens en afmeldingen (per onderdeel of voor de bbq).
2. **Partners koppelen**: koppels uit de opgave, partnerzoekers automatisch gekoppeld op niveau, en een kant-en-klare mail voor wie overblijft. Wie zich niet voor een onderdeel inschreef, wordt nooit gekoppeld.
3. **Niveaus**: per speler 1 (recreatief) tot 5 (sterk).
4. **Klassen & poules**: indeling op niveau, met voorstellen bij te kleine of te grote klassen (alleen verschuiven naar een aangrenzende klasse).
5. **Planning**: rooster per tijd en baan. Na publiceren ligt de planning vast; afmeldingen en late aanmeldingen vragen dan om een keuze (laten vervallen, vervangen of opnieuw plannen), met het gevolg erbij.
6. **Communicatie**: speeloverzicht per speler en mededelingen aan een groep, klaar om te mailen.

Daarnaast: instellingen, een bbq-overzicht en een spelersweergave waarin spelers hun eigen wedstrijden op tijd zien.

## Planningsregels

- Een speler staat nooit op twee banen tegelijk.
- Voorkeur: maximaal 2 wedstrijden direct achter elkaar (instelbaar); alleen losgelaten als het anders niet binnen een vaste eindtijd past.
- Spelers zo veel mogelijk op dezelfde baan; elke poule heeft een thuisbaan.
- Instelbaar: aantal banen, wedstrijdduur, pauze, begin- of eindtijd leidend of beide vast, lunchpauze, tijdblok per onderdeel, toernooivorm per onderdeel (poule, poules + finales, knock-out), aantal klassen en poulegrootte.

## Bestanden

| Pad | Inhoud |
|---|---|
| `index.html` | De complete tool in één bestand (gebouwd uit `src/`) |
| `src/engine.js` | Planningsmotor: inlezen, partners, klassen, poules en roosteren (geen DOM) |
| `src/app.js` | De gebruikersinterface |
| `src/head.html` | HTML-kop en opmaak |
| `src/voorbeeld.js` | 35 fictieve testinschrijvingen met voorbeeldniveaus |
| `build.js` | Bouwt `index.html` uit `src/` |
| `test/controle.js` | Onafhankelijke controle van een planning tegen de afgesproken regels |

## Gebruik

- **Op claude.ai** draait de tool als artifact met koppeling naar Tally (live inschrijvingen) en gedeelde opslag van keuzes en de gepubliceerde planning.
- **Los geopend** (bijvoorbeeld via GitHub Pages of door `index.html` lokaal te openen) werkt de tool met de 35 voorbeeldinschrijvingen en bewaart hij keuzes alleen in de eigen browser. Tally-koppeling en publiceren voor spelers zijn dan niet beschikbaar.

## Ontwikkelen

```bash
node build.js                              # index.html opnieuw bouwen na wijzigingen in src/
node test/controle.js                      # planning met de voorbeeldgegevens controleren
node test/controle.js ./mijn-staat.json    # met eigen instellingen en keuzes (zelfde vorm als test/voorbeeld-staat.json)
```

## Basistoernooiplanner (`basis/`)

Losse, algemene toernooiplanner voor badminton, bedoeld voor speelavonden en kleinere toernooien: spelers invoeren, aanwezigen aanvinken, onderdelen en koppels samenstellen (ook automatisch husselen, drietallen en spelen als ander geslacht), planning maken binnen begin- en eindtijd, uitslagen invullen en de stand per poule bekijken.

- Het hele programma staat in één bestand: `basis/index.html`.
- Via GitHub Pages: `https://deruiter-lab.github.io/toernooiplanner/basis/`
- Buiten claude.ai worden de gegevens alleen in de eigen browser bewaard (localStorage). Een andere opslag (back-up of online database) staat nog op de lijst met verbeterpunten.
