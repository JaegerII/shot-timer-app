# FORTH TRACE Timer

FORTH TRACE Timer für Live Fire und Dry Fire. Die App erkennt Schüsse bzw. Trigger-Klicks
über das Mikrofon, misst Draw- und Split-Zeiten und speichert Trainings lokal auf
dem Gerät.

Dazu kommt eine Hit-Factor-Wertung nach Comstock: mehrere Schützen auf einer
Stage, Live-Rangliste und ein Verlauf je Schütze, um den Fortschritt zu sehen.

Die Oberfläche ist eine eigenständige Web-App. Für die Stores wird sie mit
[Capacitor](https://capacitorjs.com) in ein natives Android- und iOS-Projekt
verpackt, damit der Mikrofonzugriff über die regulären Systemberechtigungen läuft.

## Oberfläche

Die App scrollt nicht. Jede Ansicht füllt genau eine Bildschirmhöhe, alles
Weitere öffnet als Sheet von unten. Nur zwei Bereiche scrollen intern: die
Schützenliste der Score-Ansicht und der Inhalt langer Sheets.

```
┌────────────────────────────────┐
│ SHOT TIMER              ?   ⚙  │  Hilfe und Einstellungen
├────────────────────────────────┤
│  LIVE FIRE    │    DRY FIRE    │
│            BEREIT              │
│             0.00               │
│         Pegel · Schwelle       │
│  [#03 +0,24][#02 +0,26]  [+2]  │  letzte Splits, Tipp = ganze Liste
│   [↺]     START      [🎤]      │  Mikrofonsymbol = Zustand
│  Verzög. │ Par Time │ Durchg.  │
│  [ Drills laden ] [ von Hand ] │
├────────────────────────────────┤
│   Timer  │  Score  │  Verlauf  │
└────────────────────────────────┘
```

- **Oben rechts** liegen Hilfe und Einstellungen, nicht in der Tableiste.
- **Das Mikrofonsymbol** neben START ist zugleich die Statusanzeige: neutral
  wenn ungenutzt, grün wenn bereit, orange wenn der Zugriff fehlt. Erst dann
  erscheint zusätzlich eine Warnzeile. Ein dauerhafter Statustext entfällt.
- **Drills** sind ein Knopf auf der Timer-Karte, kein eigener Reiter.
- **Erkennungsprofil, Empfindlichkeit und Kalibrieren** stehen in den
  Einstellungen, direkt mit der Erklärung dazu.
- **Verlauf** ist eine eigene Ansicht – kein Sheet – und führt Trainings und
  gespeicherte Stages über zwei Segmente zusammen.

### Farben, Textur und Schrift

Die Farben stammen aus dem **FORTH TRACE Design System** (Schwarzgruen-Basis,
Bone als Textfarbe, Alert als einzige Semantikfarbe). Abweichend davon bleibt
der Akzent auf Wunsch `#ff3131` statt der System-Signalfarbe Sage `#A3A398`.

Akzentfarbe ist `#ff3131`. Sie steckt an drei Stellen und muss bei einer
Aenderung ueberall nachgezogen werden: in den Token `--accent*` im Stylesheet,
im Favicon-Data-URI im `<head>` und in `ACCENT` in `tools/make-icons.mjs`
(danach `npm run build`).

Der Hintergrund traegt eine Hoehenlinien-Textur. `tools/make-topo.mjs` erzeugt
sie prozedural: umlaufendes Wertrauschen, Marching Squares fuer die Isolinien,
verkettet zu Polylinien. Ausgabe sind `dist/assets/topo.svg` (helle Linien) und
`topo-light.svg` (dunkle Linien); umgeschaltet wird ueber `data-theme`.

Schrift ist **Montserrat**, als variable Schriftdatei fuer alle Straerken von
100 bis 900. Sie liegt unter `dist/assets/fonts/` **lokal im Projekt** und wird
nicht zur Laufzeit von Google geladen – die App muss ohne Netz laufen, und die
Datenschutzerklaerung sagt zu, dass keine Verbindungen nach aussen entstehen.

`node tools/fetch-fonts.mjs` holt die Dateien neu (Zeichensaetze `latin` und
`latin-ext`, zusammen rund 106 KB) und schreibt die passenden
`@font-face`-Regeln nach `dist/assets/fonts/font-face.css`. Von dort gehoeren
sie an den Anfang des `<style>`-Abschnitts in `dist/index.html`.

Montserrat steht unter der **SIL Open Font License 1.1**; der Lizenztext liegt
als `dist/assets/fonts/OFL.txt` bei, weil die Lizenz das verlangt. Er muss
mit ausgeliefert werden.

Die Token `--font-display` und `--font-text` zeigen derzeit beide auf
Montserrat. Sie bleiben getrennt, damit sich eine eigene Auszeichnungsschrift
spaeter an einer Stelle einsetzen laesst. Urspruenglich war dafuer *Intro*
vorgesehen – die ist kommerziell lizenziert und liegt dem Projekt nicht bei.

Montserrat laeuft breiter als die Systemschrift. Nach einem Schriftwechsel
lohnt ein Blick auf die Quick-Settings und den Split-Streifen: dort sind die
Schriftgroessen knapp auf eine Zeile abgestimmt.

### Hell und Dunkel

Alle Farben laufen über Token auf `:root`; `:root[data-theme="light"]`
definiert sie für den Hellmodus neu. Umschalten unter *Einstellungen →
Darstellung* zwischen **Automatisch** (folgt dem System), **Hell** und
**Dunkel**. Vorgabe ist Dunkel. Die Wahl wird gespeichert und setzt zugleich
`<meta name="theme-color">`.

## Hit Factor

Die Ansicht *Score* rechnet nach IPSC/USPSA-Comstock:

| | A | C | D | M · NS · PE |
| --- | --- | --- | --- | --- |
| **Major** | 5 | 4 | 2 | je −10 |
| **Minor** | 5 | 3 | 1 | je −10 |

```
Punkte     = max(0, A·wA + C·wC + D·wD − 10·(M + NS + PE))
Hit Factor = Punkte / Zeit
Prozent    = Hit Factor / bester Hit Factor der Stage
Stage-Pkt  = Prozent · (Schüsse · 5)
```

Bedienung: *+ Schütze hinzufügen* legt einen Schützen an oder holt einen
gespeicherten dazu. Das Badge neben dem Namen schaltet zwischen Minor und Major.
Die Trefferzonen zählt ein Tipp auf die Kachel hoch, das kleine − wieder herunter.
*Aus Timer* übernimmt die zuletzt im Timer gemessene Zeit und trägt – solange noch
keine Treffer stehen – die gezählten Schüsse als A ein.

*Stage speichern* legt die Wertung ab – nachzulesen unter *Verlauf → Stages* –,
*Neue Stage* leert die Zeiten und behält die Schützen für den nächsten Durchgang. Das Diagramm-Symbol in jeder
Karte und ein Tipp auf eine Zeile der Rangliste öffnen den Fortschritt eines
Schützen: bester und durchschnittlicher Hit Factor, Stage-Siege und der Verlauf
als Kurve.

Eine laufende Stage wird nach jeder Eingabe gesichert und übersteht damit auch
ein Beenden der App durch das System.

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
  make-topo.mjs            Erzeugt die Hoehenlinien-Textur des Hintergrunds
  fetch-fonts.mjs          Laedt die Schriftdateien und legt sie lokal ab
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

## Als Web-App veroeffentlicht

https://jaegerii.github.io/shot-timer-app/

`.github/workflows/pages.yml` stellt `dist/` nach jedem Push auf `main`
ueber GitHub Pages bereit. Die feste HTTPS-Adresse ist Voraussetzung dafuer,
dass der Mikrofonzugriff erlaubt wird und sich die App auf dem iPhone zum
Home-Bildschirm hinzufuegen laesst.

Auf dem iPhone: in **Safari** oeffnen (nicht Chrome), Teilen → *Zum
Home-Bildschirm*. Danach startet sie im Vollbild ohne Browserleiste, mit
eigenem Symbol und laeuft dank Service Worker offline.

**Der Service Worker muss zum Inhalt passen.** `dist/sw.js` enthaelt die
Dateiliste und eine Version aus einem Inhalts-Hash. Nach jeder Aenderung an
`dist/` gehoert `npm run sw` ausgefuehrt und das Ergebnis eingecheckt –
`npm run build` erledigt das mit. Der Workflow erzeugt die Datei vor dem
Veroeffentlichen zur Sicherheit neu und warnt, wenn der eingecheckte Stand
veraltet war.

In der Capacitor-App wird der Service Worker bewusst **nicht** registriert:
dort liefert der WebView die Dateien ohnehin lokal aus, und ein zusaetzlicher
Cache wuerde nach einem App-Update den alten Stand festhalten.

Web-App und Store-App sind getrennte Ablageorte. Trainings und Stages aus dem
Web-Test tauchen in der spaeteren App nicht auf.

---

# Weg in die Stores

## Aktueller Stand

Fertig:

- Natives Android- und iOS-Projekt angelegt (`de.forthtrace.timer`, Version 1.0)
- Mikrofonberechtigung deklariert: `RECORD_AUDIO` (Android),
  `NSMicrophoneUsageDescription` (iOS)
- App-Icons und Splash-Screens für beide Plattformen erzeugt, das 1024er-Icon
  ohne Alphakanal, wie App Store Connect es verlangt
- Entwurf der Datenschutzerklärung (`PRIVACY.md`)

Offen – siehe die Abschnitte unten.

## App-ID festlegen

Die App-ID steht aktuell auf `de.forthtrace.timer`. **Sie lässt sich nach der
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

- **Kostenpflichtiges Apple Developer Program**, 99 EUR pro Jahr. Der
  kostenlose Apple-Entwicklerzugang genuegt nicht: mit ihm gibt es weder
  Verteilungszertifikate noch App Store Connect, TestFlight oder den Store.
  Er erlaubt nur, die App per Xcode auf ein eigenes Geraet zu legen – mit
  sieben Tagen Gueltigkeit und einem Mac als Voraussetzung.
- Eine macOS-Maschine für den Build – entweder ein eigener Mac oder eine
  gemietete in der Cloud. Der Zwang kommt von Apple: `xcodebuild` und
  `codesign` laufen ausschließlich unter macOS. Das gilt für **jedes**
  Framework, auch für Flutter, React Native oder MAUI. Ein Wechsel der
  Technik würde daran nichts ändern.

**Ohne eigenen Mac: Build in der Cloud**

`codemagic.yaml` im Projektwurzelverzeichnis beschreibt beide Plattformen.
Codemagic startet eine macOS-Maschine, baut das IPA, signiert es und lädt es
nach TestFlight. Die Zertifikate erzeugt der Dienst selbst über einen
App-Store-Connect-API-Schlüssel – dafür wird kein Keychain-Zugriff auf einem
eigenen Gerät gebraucht.

Einzurichten ist einmalig: Repository verbinden, API-Schlüssel hinterlegen,
App-ID und App-Eintrag anlegen, Android-Keystore hochladen. Die Schritte
stehen als Kommentar oben in `codemagic.yaml`. Kontingente und Preise der
kostenlosen Stufe bitte aktuell prüfen.

Gleichwertige Alternativen: **Bitrise**, **Ionic Appflow** oder **GitHub
Actions** mit `runs-on: macos-latest`. Bei GitHub Actions muss die Signatur
selbst eingerichtet werden (Zertifikat und Profil als Secrets, üblicherweise
über fastlane) – mehr Aufwand, dafür ohne zusätzlichen Anbieter. Wer lieber
direkt an einem Mac arbeitet, mietet einen bei MacStadium oder MacInCloud.

Damit ein Cloud-Build überhaupt startet, muss das Xcode-Scheme geteilt sein.
Capacitor legt es nur benutzerlokal an, deshalb liegt
`ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` hier im
Repository. Nicht löschen.

**Build auf einem eigenen Mac**

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
- Match über mehrere Stages. Die Stage-Punkte werden bereits je Stage berechnet
  und gespeichert; es fehlt die Ansicht, die sie über mehrere Stages summiert.
- Export der Wertungen, etwa als CSV.
