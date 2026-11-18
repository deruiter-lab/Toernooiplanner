# Toernooiplanner badminton

Toernooiplanner voor badminton van Luck Raeck, voor speelavonden en kleinere toernooien. Het hele programma staat in één bestand: `index.html`.

Online via GitHub Pages: https://deruiter-lab.github.io/toernooiplanner/

## Stappen

1. **Spelers**: spelers invoeren (één voor één of als lijst) en aanvinken wie er is.
2. **Onderdelen**: herendubbel, damesdubbel, gemengd dubbel, herenenkel, damesenkel en enkel gemixed. Koppels zelf samenstellen of automatisch husselen uit de aanwezigen; onderdelen die met de aanwezigen niet kunnen, zijn uitgeschakeld.
3. **Planning**: rooster per tijd en baan, binnen een begin- en eindtijd, met instelbare wedstrijdduur, pauze, aantal banen en aantal poules per onderdeel.
4. **Uitslagen** (optioneel): punten invullen; een wedstrijd telt als gespeeld zodra beide scores zijn ingevuld. Daarnaast een stand per poule en een overzicht per speler.

Een stap is pas voltooid als de stappen ervoor voltooid zijn; wijzigt er iets in een eerdere stap, dan gaan de stappen erna weer open.

## Toernooivormen

Per onderdeel te kiezen bij stap 2:

- **Poule**: iedereen tegen iedereen, in één of meer poules.
- **Poules met finale**: na de poules standaard per poule een eigen finale (nr. 1 tegen 2, of halve finales met nr. 1 t/m 4). Of één finale over alle poules: de nummers 1 (of 1 en 2) spelen halve finales en een finale.
- **Knock-out**: wie verliest, ligt eruit; optioneel een troostronde voor de verliezers van ronde 1.
- **Wisselende partners** (dubbelspel): elke ronde nieuwe duo's; iedereen speelt voor zichzelf en verzamelt punten.
- **Koning van de baan**: winnaars schuiven een baan op, verliezers een baan af.
- **Zwitsers systeem**: een vast aantal rondes, steeds tegen iemand met ongeveer dezelfde score.

Wedstrijden zijn op tijd; de stand na afloop van de tijd telt. Bij knock-out en Koning van de baan beslist bij gelijke stand een extra punt. Finales, knock-outrondes en volgende rondes worden vooraf ingeroosterd en vullen zich in zodra de uitslagen binnen zijn.

## Poules op sterkte

Kies je bij een poulevorm 2 of meer poules (tot 8), dan verschijnt in de onderdeelkaart de knop **Spelers indelen**. In dat scherm zet je spelers in poule A, B, C … (sterk naar minder sterk); spelers op "auto" verdeelt de app zodat de poules even groot worden. De tellers per poule staan steeds in beeld. Klopt een poule niet (oneven bij dubbel, ongelijk heren/dames bij mix), dan stelt de app voor wie naar welke poule kan; je kunt een andere speler of poule kiezen. "Koppels samenstellen per poule" maakt de koppels binnen elke poule. Zelf gemaakte koppels deel je in met de knopjes A/B/C bij het koppel.

## Planningsregels

- Een speler staat nooit op twee banen tegelijk.
- De tool zoekt het kortste rooster (banen zo vol mogelijk); daarna zo weinig mogelijk wedstrijden achter elkaar en baanwissels.
- Overblijvers kunnen als ander geslacht meespelen of als derde bij een koppel aansluiten (drietal, om de beurt rusten).
- Na een afmelding blijven gespeelde wedstrijden staan en wordt de rest opnieuw ingepland.

## Opslag

Buiten claude.ai worden de gegevens alleen in de eigen browser bewaard (localStorage). Wie de planner voor het eerst opent, begint met een standaardlijst van 28 clubleden. Wijzigingen en aanvullingen worden daarna in de eigen browser bewaard. Via Instellingen → "Standaardlijst spelers terugzetten" begin je opnieuw met die lijst. Een andere opslag (back-up of online database) staat op de lijst met verbeterpunten.
