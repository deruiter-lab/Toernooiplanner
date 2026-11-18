# Toernooiplanner badminton

Toernooiplanner voor badminton van Luck Raeck, voor speelavonden en kleinere toernooien. Het hele programma staat in één bestand: `index.html`.

Online via GitHub Pages: https://deruiter-lab.github.io/toernooiplanner/

## Stappen

1. **Spelers**: spelers invoeren (één voor één of als lijst) en aanvinken wie er is.
2. **Onderdelen**: herendubbel, damesdubbel, gemengd dubbel, herenenkel, damesenkel en enkel gemixed. Koppels zelf samenstellen of automatisch husselen uit de aanwezigen; onderdelen die met de aanwezigen niet kunnen, zijn uitgeschakeld.
3. **Planning**: rooster per tijd en baan, binnen een begin- en eindtijd, met instelbare wedstrijdduur, pauze, aantal banen en aantal poules per onderdeel.
4. **Uitslagen** (optioneel): punten invullen; een wedstrijd telt als gespeeld zodra beide scores zijn ingevuld. Daarnaast een stand per poule en een overzicht per speler.

Een stap is pas voltooid als de stappen ervoor voltooid zijn; wijzigt er iets in een eerdere stap, dan gaan de stappen erna weer open.

## Planningsregels

- Een speler staat nooit op twee banen tegelijk.
- De tool zoekt het kortste rooster (banen zo vol mogelijk); daarna zo weinig mogelijk wedstrijden achter elkaar en baanwissels.
- Overblijvers kunnen als ander geslacht meespelen of als derde bij een koppel aansluiten (drietal, om de beurt rusten).
- Na een afmelding blijven gespeelde wedstrijden staan en wordt de rest opnieuw ingepland.

## Opslag

Buiten claude.ai worden de gegevens alleen in de eigen browser bewaard (localStorage). Een andere opslag (back-up of online database) staat op de lijst met verbeterpunten.
