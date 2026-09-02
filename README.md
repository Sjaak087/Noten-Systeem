# Noten Verkoop — Firebase voorraadwebsite

## Wat zit erin?
- Eén gedeeld e-mailadres en wachtwoord.
- Eerste keer: account instellen.
- E-mailadres en wachtwoord worden opgeslagen in Firebase Realtime Database onder `credentials`.
- Daarna kan iedereen met dezelfde gegevens inloggen.
- Producten maken met **Gram** of **Aantal**.
- Voorraad live opgeslagen in Firebase Realtime Database.
- Bestellen trekt automatisch de bestelde hoeveelheid van de voorraad af.
- Bij 0 staat het product als **Uitverkocht**.
- Instellingen: productnaam wijzigen, eenheid wijzigen, voorraad aanpassen en voorraad toevoegen.
- Moderne responsive donkere UI.

## Firebase
De volledige webconfig staat in `firebase-config.js`. De website gebruikt alleen Firebase App + Realtime Database; Firebase Authentication is niet nodig voor deze login.

De Firebase-config bevat de normale webapp-configuratie. Firebase beschrijft deze waarden als project/app-identifiers; de daadwerkelijke beveiliging van Realtime Database wordt geregeld met de database Security Rules. Zie de officiële Firebase-documentatie voor de configuratie en Realtime Database. 

## Belangrijk over de login
Deze versie doet **geen Firebase Authentication**.

De eerste gebruiker vult een e-mail en wachtwoord in. De website slaat dit op als:

`credentials/email`
`credentials/password`

Daarna vergelijkt de website de ingevoerde gegevens met deze waarden in de database.

**Let op:** dit betekent dat het wachtwoord als gewone tekst in de database staat. Gebruik daarom geen belangrijk persoonlijk wachtwoord. Als je database openbaar leesbaar is, kunnen anderen de inloggegevens ook lezen.

## Firebase Realtime Database instellen
Er zit bewust **geen `database.rules.json`** in deze ZIP.

Je moet in Firebase Console bij **Realtime Database → Rules** zelf regels instellen die passen bij deze simpele database-login. De webclient kan alleen lezen/schrijven als de Security Rules dat toestaan. Voor snel testen kun je de tijdelijke testmodus van Firebase gebruiken, maar Firebase waarschuwt dat daarmee iedereen je database kan lezen en overschrijven; voor een echte website moet je de regels later beveiligen.

## GitHub Pages
1. Upload alle bestanden naar je GitHub-repository.
2. Ga naar **Settings → Pages**.
3. Kies **Deploy from a branch**.
4. Selecteer je branch en map.
5. Open de GitHub Pages-link.


## Extra
- Prijs per gram of per aantal instellen.
- Iedere bestelling wordt automatisch in `history` opgeslagen.
- Historie toont verkochte hoeveelheden, omzet per verkoop, totale omzet en verkochte hoeveelheid per product.


### Automatisch vernieuwen
De website vernieuwt zichzelf automatisch ongeveer iedere minuut. Er is hiervoor geen `version.json` of extra updatebestand nodig. De nieuwste `app.js` wordt bij het vernieuwen met een unieke cachebuster geladen.
