# App Store – Texte für FORTH TRACE Shot Timer

Zum Einfügen in App Store Connect → App → iOS-App 1.0 bzw. App-Informationen.
Grenzen von Apple in Klammern; alle Texte unten halten sie ein.

Suchbegriffe: Apple durchsucht Name, Untertitel und Schlüsselwörter gemeinsam.
Wörter, die schon im Namen stehen („Shot“, „Timer“), werden deshalb nicht
wiederholt; der Platz geht an weitere Suchbegriffe.

---

## Neueinreichung 1.0 mit Video – Checkliste

**Vorher**
1. Codemagic: Workflow „FORTH TRACE Timer iOS“ starten. Warten, bis der Build in App Store Connect unter TestFlight auf „Bereit zum Testen“ steht (E-Mail von Apple, ca. 10–30 min).
2. In TestFlight auf dem iPhone testen: Video aus Fotos wählen (Schüsse erkannt?), abspielen (flüssig?), Marker verschieben, schneiden, Endkarte ansehen, in Full HD exportieren, über das Teilen-Menü „Video sichern“. Kurz auch Timer, Score, Verlauf.

**App Store Connect → Apps → FORTH TRACE Shot Timer → iOS-App 1.0**
3. **Build:** im Abschnitt „Build“ den alten mit „–“ entfernen, mit „+“ den neuen wählen. Fragen zu Verschlüsselung/Exportbestimmungen wie beim ersten Mal beantworten.
4. **Screenshots** (Abschnitt „App-Vorschau und Screenshots“): bei 6,9" `store/screenshots/en-6.9/7.png` und `8.png` hochladen, bei 6,5"/6,3" `en-6.3/7.png` und `8.png`. Reihenfolge: 1, 7, 8, 2, 3, 4, 5, 6. Gibt es eigene deutsche Screenshots, dort genauso.
5. **Texte**, je Sprache (Englisch und Deutsch, oben rechts umschalten): Werbetext, Beschreibung und Schlüsselwörter aus den Abschnitten unten ersetzen. Name und Untertitel bleiben.
6. **App-Review-Informationen:** Feld „Notizen“ durch den Abschnitt „Hinweise für die Prüfung“ ersetzen. Kontaktdaten prüfen.
7. **Sichern** (oben rechts).

**App-Informationen und Datenschutz (links im Menü)**
8. App-Datenschutz bleibt „Keine Daten erfasst“ – Videos werden nur auf dem Gerät verarbeitet.
9. **Altersfreigabe** (App-Informationen → Altersfreigabe → Bearbeiten): Seit September 2026 fragt Apple zusätzlich nach Social-Media-Funktionen. Antwort: **Nein** – die App hat keinen Feed, keine Profile, keine Kommentare und zeigt keine Inhalte anderer Nutzer. Das Teilen eines Videos über das iOS-Teilen-Menü gehört nicht dazu. Die übrigen Antworten bleiben wie beim ersten Mal.

**Einreichen**
10. Unter „App Review“ (bzw. Link in Apples Mail) auf die Ablehnung antworten: Abschnitt „Antwort an App Review“. Den Absatz zu den TestFlight-Builds nur stehen lassen, wenn es wirklich weitere 1.0-Builds mit Video gab.
11. „Zur Prüfung hinzufügen“ → „An App Review senden“. Antwort meist nach 24–48 h.

---

## Allgemein (für beide Sprachen gleich)

| Feld | Wert |
|---|---|
| Name (30) | FORTH TRACE Shot Timer |
| Primäre Kategorie | Sport |
| Sekundäre Kategorie | Gesundheit und Fitness *(optional)* |
| Preis | Kostenlos |
| Datenschutz-URL | https://jaegerii.github.io/shot-timer-app/privacy.html |
| Support-URL | https://jaegerii.github.io/shot-timer-app/support.html |
| Kopfzeile (optional) | `store/header/header-3840x1646.mp4` (Animation) oder `.png` |
| Marketing-URL | https://www.instagram.com/wax_meils/ *(optional)* |
| Copyright | © 2026 Maximilian Weil |
| Screenshots | In der Hauptsprache hochladen, Apple verwendet sie für alle Sprachen. Großes Display (6,9"): `store/screenshots/en-6.9/1–8.png` (1320 × 2868). Mittleres Display (6,1"/6,3"): `store/screenshots/en-6.3/1–8.png` (1206 × 2622). Nr. 7 ist der Video-Editor, Nr. 8 das fertige Video; beide im Store gern an Position 2 und 3 ziehen. Quellvideos liegen nur lokal in `store/media/` |
| App-Datenschutz | Keine Daten erfasst („Data Not Collected“) |

---

## English (U.S. / U.K.)

**Subtitle (30)**
```
Dry Fire, Par Time, Hit Factor
```

**Promotional text (170)**
```
Your phone is the shot timer: beep, draw, every split – live or dry fire. Plus Hit Factor, match results and your stage video with the splits in the corner. Free.
```

**Keywords (100)**
```
ipsc,uspsa,idpa,splits,draw,pistol,practical,shooting,range,practice,video,match,competition
```

**Description (4000)**
```
Turn your iPhone into a shot timer. FORTH TRACE Shot Timer listens for the beep-to-shot moment, catches every shot or trigger click and shows your draw and splits instantly – at the range or in dry practice at home. No extra hardware, no account, no ads.

TIMER
• Standby, then the start beep – instant, random 1–4 s or your own fixed delay
• Par time in tenths of a second with a double beep when you're over
• Multiple runs back to back
• Live Fire for loud shots, Dry Fire for quiet trigger clicks – each with its own sensitivity and calibration
• Glowing screen edge you can see from the corner of your eye: yellow on standby, green while timing, red after par
• Draw, splits and total time at a glance, with vibration on the start signal

MATCHES & HIT FACTOR
• Create matches with as many stages as you need
• Score every shooter: time and hit zones (A, C, D, Miss, No-Shoot, Procedural), Major or Minor
• Live Hit Factor, stage percentages and overall match points
• Pull the time straight from the timer with one tap
• Track each shooter's progress across all matches

STAGE VIDEO
• Pick a video of your run – the start beep and every shot are found in the audio
• Fine-tune markers on the waveform, add or delete shots, start on the beep or on the first shot
• Trim the clip and export it with running time and splits in the corner of your choice
• Export in original quality, 1080p or 720p and save or share it right away

HISTORY
• Every run is saved automatically with all times and splits

PRIVATE BY DESIGN
• The microphone is analysed live and never recorded
• Videos are processed on your iPhone and never uploaded
• No account, no tracking, no ads – your data stays on your iPhone

10 languages: English, German, French, Spanish, Italian, Dutch, Polish, Czech, Portuguese and Swedish.

Good to know: phone-microphone detection varies with device and environment – check your times against a reference before relying on them. Range rules and firearm safety are your responsibility; always dry fire with an unloaded firearm and no ammunition nearby.

More training and tips: @wax_meils on Instagram and YouTube.
```

---

## Deutsch

**Untertitel (30)**
```
Dry Fire, Par Time, Hit Factor
```

**Werbetext (170)**
```
Dein iPhone ist der Shot Timer: Piep, Draw, jeder Split – Live und Dry Fire. Dazu Hit Factor, Match-Wertung und dein Stage-Video mit Splits. Kostenlos, ohne Konto.
```

**Schlüsselwörter (100, durch Kommas getrennt, ohne Leerzeichen)**
```
schießen,ipsc,uspsa,splits,draw,pistole,sportschießen,trockentraining,stand,video,wettkampf
```

**Beschreibung (4000)**
```
Mach dein iPhone zum Shot Timer. FORTH TRACE Shot Timer hört nach dem Startsignal mit, erkennt jeden Schuss oder Trigger-Klick und zeigt Draw-Zeit und Splits sofort an – direkt am Stand oder beim Trockentraining zu Hause. Ohne Zusatzgerät, ohne Konto, ohne Werbung.

TIMER
• Standby, dann der Startpiep – sofort, zufällig 1–4 s oder mit eigener fester Verzögerung
• Par Time in Zehntelsekunden, mit Doppelpiep, sobald du drüber bist
• Mehrere Durchgänge automatisch hintereinander
• Live Fire für laute Schüsse, Dry Fire für leise Trigger-Klicks – jeweils mit eigener Empfindlichkeit und Kalibrierung
• Leuchtender Bildschirmrand, den du aus dem Augenwinkel siehst: gelb bei Standby, grün während der Messung, rot nach der Par Time
• Draw, Splits und Gesamtzeit auf einen Blick, mit Vibration beim Startsignal

MATCHES & HIT FACTOR
• Matches mit beliebig vielen Stages anlegen
• Jeden Schützen werten: Zeit und Trefferzonen (A, C, D, Miss, No-Shoot, Prozedurfehler), Major oder Minor
• Hit Factor, Stage-Prozente und Gesamtwertung live
• Zeit mit einem Tipp aus dem Timer übernehmen
• Fortschritt jedes Schützen über alle Matches

STAGE-VIDEO
• Video deines Durchgangs wählen – Startpiep und jeder Schuss werden aus der Tonspur erkannt
• Marker auf der Tonspur verschieben, Schüsse ergänzen oder löschen, Start per Piep oder erstem Schuss
• Video zuschneiden und mit laufender Zeit und Splits in der Ecke deiner Wahl exportieren
• Export in Originalqualität, 1080p oder 720p, direkt sichern oder teilen

VERLAUF
• Jeder Durchgang wird automatisch gespeichert – mit allen Zeiten und Splits

DATENSCHUTZ
• Das Mikrofon wird nur live ausgewertet, nie aufgenommen
• Videos werden auf deinem iPhone verarbeitet und nirgends hochgeladen
• Kein Konto, kein Tracking, keine Werbung – deine Daten bleiben auf deinem iPhone

10 Sprachen: Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch, Polnisch, Tschechisch, Portugiesisch und Schwedisch.

Gut zu wissen: Die Erkennung über das Telefonmikrofon hängt von Gerät und Umgebung ab – prüfe die Zeiten vor wichtigen Einsätzen gegen eine Referenz. Regeln des Standes und Waffensicherheit liegen in deiner Verantwortung; beim Dry Fire immer mit entladener Waffe und ohne Munition in der Nähe trainieren.

Mehr Training und Tipps: @wax_meils auf Instagram und YouTube.
```

---

## Hinweise für die Prüfung (App Review → Notizen)

```
The app is a shot timer for practical shooting training. No login is required, and all features are visible in the tab bar: Timer, Score, Video and History, plus Settings (gear icon, top right). Nothing is downloaded from a server and there are no feature flags or hidden menus.

Timer: the microphone is only used to detect the loudness of shots or trigger clicks in real time; nothing is recorded or transmitted. To test without firearms: allow microphone access, tap START, wait for the beep and clap loudly – each clap is recorded as a shot. Dry Fire mode reacts to quieter clicks (e.g. tapping the table).

Score: matches, stages and Hit Factor scoring.

Video: tap "Choose video" and pick any video with a few loud sounds (or record one in the picker and clap a few times). The app finds the sounds in the audio track and shows them as markers. If the video has no start beep, open the settings (slider icon next to the scissors) and set Start to "First shot". Tap Export, then Start: the video is rendered in real time on the device with the timer overlay and can be saved or shared. Videos never leave the device.
```

## Antwort an App Review (Ablehnung 5.6 vom November 2026)

In App Store Connect → App Review → Antworten. Zusammen mit dem neuen Build einreichen.

```
Hello App Review team,

Thank you for your feedback. FORTH TRACE Shot Timer does not contain any hidden, locked or remotely activated features. All functionality ships in the binary; the app does not download code or configuration, has no feature flags, no hidden menus or gestures and no region or review detection.

We believe the issue came from TestFlight: after submitting version 1.0 we uploaded further 1.0 builds that already contained a new Video tab, while the build in review did not have it yet. To keep everything consistent we have now selected the latest build for version 1.0. It contains every feature of the app, all reachable from the tab bar: Timer, Score, Video and History, plus Settings (gear icon, top right). The review notes explain how to test each of them, including the video feature.

If anything is still unclear, please tell us which feature or screen led to this assessment. We are happy to explain or change it, and a phone call is welcome.

Kind regards,
Maximilian Weil
```

## Altersfreigabe – Hinweis

Den Fragebogen ehrlich ausfüllen. Die App zeigt keine Gewalt und keine Waffen
im Bild, hat aber Schießsport zum Thema; Apple fragt je nach Version gezielt nach
Waffen. Im Zweifel die höhere Stufe wählen, damit die Prüfung nicht daran hängt.
