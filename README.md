# StockFlow — Firebase voorraadwebsite

## Inhoud
- Inloggen met één gedeeld e-mail/wachtwoord.
- Eerste keer: account aanmaken via de website.
- Producten maken met **Gram** of **Aantal**.
- Voorraad live opgeslagen in Firebase Realtime Database.
- Bestellen trekt automatisch de bestelde hoeveelheid van de voorraad af.
- Bij 0 staat het product als **Uitverkocht**.
- Instellingen: productnaam wijzigen, eenheid wijzigen, voorraad aanpassen en voorraad toevoegen.
- Moderne responsive donkere UI.

## Firebase
De meegegeven Firebase-configuratie staat al in `app.js`.

Voor het inloggen gebruikt de website **Firebase Authentication (Email/Password)**. Het wachtwoord wordt bewust niet als leesbare tekst in Realtime Database opgeslagen; Firebase Authentication beheert het wachtwoord veilig.

## Firebase instellen
1. Open Firebase Console voor project `website-e9a77`.
2. Ga naar Authentication → Sign-in method.
3. Zet **Email/Password** aan.
4. Ga naar Realtime Database en zorg dat de database bestaat.
5. Publiceer de bestanden op GitHub Pages.

### Aanbevolen Realtime Database Rules
De applicatie is bedoeld voor één gedeeld account. Gebruik voor een echte productieomgeving bij voorkeur strengere regels. Een eenvoudige startconfiguratie is:

{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}

## GitHub Pages
Upload `index.html`, `style.css` en `app.js` naar een repository. Zet daarna GitHub Pages aan via Settings → Pages → Deploy from a branch.

De website is volledig statisch en heeft dus geen eigen server nodig.
