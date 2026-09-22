# Shot Timer

Shot Timer für Live Fire und Dry Fire. Die App erkennt Schüsse bzw. Trigger-Klicks
über das Mikrofon, misst Draw- und Split-Zeiten und speichert Trainings lokal auf
dem Gerät.

Die Oberfläche ist eine eigenständige Web-App. Für die Stores wird sie mit
[Capacitor](https://capacitorjs.com) in ein natives Android- und iOS-Projekt
verpackt, damit der Mikrofonzugriff über die regulären Systemberechtigungen läuft.

## Aufbau

```
dist/                      Die App – wird 1:1 in die nativen Projekte kopiert
  index.html               Oberfläche, Styling und gesamte Logik
  manifest.webmanifest     Web-App-Manifest
  assets/                  Audio-Cues und Icons
assets/                    Quellbilder für die nativen Icons und Splash-Screens
android/                   Natives Android-Projekt (Capacitor)
ios/                       Natives Xcode-Projekt (Capacitor)
tools/
  dev-server.mjs           Statischer Server für die lokale Entwicklung
  make-icons.mjs           Erzeugt alle Icons und Splash-Quellbilder
capacitor.config.json      App-ID, App-Name, Web-Verzeichnis
PRIVACY.md                 Entwurf der Datenschutzerklärung
```

Die Logik liegt bewusst in einer einzigen Datei: kein Build-Schritt, `dist/` ist
direkt lauffähig und zugleich das Web-Verzeichnis für Capacitor.

## Lokal starten

```bash
npm run dev
```

Anschließend `http://localhost:8080` öffnen. Der Mikrofonzugriff funktioniert nur
über HTTPS oder `localhost` – ein direkt geöffnetes `dist/index.html` bleibt ohne
Mikrofon (die Testtaste wird dann automatisch eingeblendet).

## Assets neu erzeugen

```bash
npm run build
```

Das erzeugt die Icons und Splash-Quellbilder neu, leitet daraus die nativen
Varianten ab und kopiert `dist/` in beide Plattformen. Einzelschritte:
`npm run icons`, `npm run assets`, `npm run sync`.

## Nach jeder Änderung an `dist/`

```bash
npx cap sync
```

Ohne `sync` läuft in den nativen Projekten weiter der alte Stand.

---

# Weg in die Stores

## Aktueller Stand

Fertig:

- Natives Android- und iOS-Projekt angelegt (`de.wemacon.shottimer`, Version 1.0)
- Mikrofonberechtigung deklariert: `RECORD_AUDIO` (Android),
  `NSMicrophoneUsageDescription` (iOS)
- App-Icons und Splash-Screens für beide Plattformen erzeugt, das 1024er-Icon
  ohne Alphakanal, wie App Store Connect es verlangt
- Entwurf der Datenschutzerklärung (`PRIVACY.md`)

Offen – siehe die Abschnitte unten.

## App-ID festlegen

Die App-ID steht aktuell auf `de.wemacon.shottimer`. **Sie lässt sich nach der
ersten Veröffentlichung nicht mehr ändern.** Falls eine andere gewünscht ist, jetzt
in `capacitor.config.json` anpassen und danach `android/` und `ios/` neu anlegen:

```bash
rm -rf android ios && npx cap add android && npx cap add ios && npm run build
```

## Android / Google Play

**Voraussetzungen**

- Android Studio (bringt das SDK und ein passendes JDK mit; das installierte
  Java 8 reicht für den Build nicht aus)
- Google-Play-Entwicklerkonto, einmalig 25 USD

**Build**

```bash
npm run android
```

Das öffnet Android Studio. Dort *Build → Generate Signed App Bundle* wählen und
ein neues Keystore anlegen.

> Das Keystore und sein Passwort sicher sichern. Ohne sie lässt sich keine
> Aktualisierung der App mehr veröffentlichen. `.gitignore` schließt
> Signaturmaterial bewusst vom Repository aus.

**Im Play-Console-Eintrag benötigt**

- Titel, Kurz- und vollständige Beschreibung
- Icon 512×512, Feature-Grafik 1024×500
- Mindestens zwei Screenshots pro unterstützter Geräteklasse
- Öffentliche URL zur Datenschutzerklärung
- Formular „Datensicherheit": *Es werden keine Daten erfasst oder geteilt.* Das
  Mikrofon wird ausschließlich lokal in Echtzeit ausgewertet, ohne Aufzeichnung.
- Inhaltsbewertung (IARC-Fragebogen)
- Für neue Konten: geschlossener Test mit Testenden vor der Produktionsfreigabe

**Versionen erhöhen** in `android/app/build.gradle` (`versionCode`, `versionName`).

## iOS / App Store

**Voraussetzungen**

- Ein Mac mit Xcode. Das ist zwingend – auf Windows lässt sich kein iOS-Build
  erstellen und nichts einreichen. Alternative ohne eigenen Mac: ein
  CI-Dienst mit macOS-Runnern (z. B. Codemagic, Bitrise, GitHub Actions).
- CocoaPods auf dem Mac
- Apple Developer Program, 99 USD pro Jahr

**Build auf dem Mac**

```bash
npm install
npx cap sync ios
npm run ios
```

In Xcode das Signing-Team setzen, dann *Product → Archive* und über den Organizer
an App Store Connect übergeben.

**Im App-Store-Connect-Eintrag benötigt**

- Screenshots für 6,7″ und 6,5″ iPhone
- Öffentliche URL zur Datenschutzerklärung
- App-Datenschutz: *Data Not Collected*
- Altersfreigabe über den Fragebogen
- Hinweise für die Prüfung: erklären, dass die App das Mikrofon für die
  Zeitmessung auswertet und nichts aufzeichnet

**Zwei Punkte, an denen die Prüfung erfahrungsgemäß hakt**

1. *Guideline 4.2 – Minimum Functionality.* Apple prüft kritisch, ob eine App
   mehr ist als eine verpackte Website. Dafür spricht hier der native
   Mikrofonzugriff und die vollständige Offline-Funktion; in den Prüfhinweisen
   sollte beides ausdrücklich genannt werden.
2. *Schusswaffenbezug.* Trainings-Timer sind in beiden Stores etabliert und
   zulässig. Die App darf aber keinen Bezug zum Verkauf von Waffen, Munition
   oder Zubehör herstellen; das wirkt sich außerdem auf die Altersfreigabe aus.

## Sinnvoll vor der Einreichung

- Erkennung auf echter Hardware am Stand prüfen. Die aktuelle Auswertung
  arbeitet rein über den Pegel im Zeitbereich und reagiert auf Nachbarstände und
  laute Stimmen. Eine frequenzbasierte Onset-Erkennung würde das deutlich
  verbessern.
- Englische Übersetzung. Die Sprachauswahl unter *Mehr* ist bewusst deaktiviert,
  bis sie hinterlegt ist.
