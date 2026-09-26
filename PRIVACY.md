# Datenschutzerklärung – Shot Timer

**Stand:** 26.09.2026
**Verantwortlich:** *(Name, Anschrift und E-Mail der verantwortlichen Stelle hier eintragen)*

> **Hinweis:** Dieser Text beschreibt das tatsächliche Verhalten der App zum oben
> genannten Stand. Er ist kein Ersatz für eine anwaltliche Prüfung. Vor der
> Veröffentlichung muss er von der verantwortlichen Stelle geprüft und unter einer
> öffentlich erreichbaren URL bereitgestellt werden – beide Stores verlangen diese
> URL im Eintrag.

## Kurzfassung

Shot Timer verarbeitet ausschließlich auf dem Gerät. Es werden keine Daten an den
Anbieter oder an Dritte übertragen. Es gibt keine Konten, kein Tracking, keine
Werbung und keine Analyse-SDKs.

## Mikrofon

Die App benötigt Zugriff auf das Mikrofon, um Schüsse und Trigger-Klicks zu
erkennen und die Zeiten zu messen.

- Das Audiosignal wird ausschließlich in Echtzeit auf dem Gerät ausgewertet.
- Es wird **keine** Aufnahme erstellt, gespeichert, zwischengespeichert oder übertragen.
- Ausgewertet wird lediglich der Lautstärkepegel; Sprachinhalte werden weder
  erkannt noch verarbeitet.
- Der Zugriff besteht nur, solange die App im Vordergrund geöffnet ist. Die
  Berechtigung kann jederzeit in den Systemeinstellungen widerrufen werden; die
  App bleibt dann mit der manuellen Testtaste eingeschränkt nutzbar.

## Lokal gespeicherte Daten

Im lokalen Speicher der App (`localStorage` der eingebetteten Web-Ansicht) werden
abgelegt:

| Schlüssel | Inhalt | Löschen in der App |
| --- | --- | --- |
| `shot-timer-settings-v1` | Einstellungen: Modus, Startverzögerung, Par Time, Durchgänge, Lautstärke, Vibration, Make Ready, Empfindlichkeit und gemessener Rauschpegel je Modus | – |
| `shot-timer-history-v2` | Bis zu 50 gespeicherte Trainings mit Zeitstempel, Modus, Drill-Name, Gesamtzeit, Anzahl der Signale und Splits | *Mehr → Trainingsdaten → Verlauf löschen* |
| `shot-timer-shooters-v1` | Selbst angelegte Schützen der Hit-Factor-Wertung: frei gewählter Name und Power Factor | *Score → Schütze hinzufügen → ×* je Eintrag |
| `shot-timer-stages-v1` | Bis zu 100 gespeicherte Stages mit Zeitstempel, Stage-Name und je Schütze Zeit, Trefferzonen, Punkten, Hit Factor, Prozent und Platzierung | *Score → Gespeichert → ×* je Stage oder *Alle Stages löschen* |
| `shot-timer-stage-draft-v1` | Die gerade laufende, noch nicht gespeicherte Stage, damit sie ein Beenden der App übersteht | wird von *Score → Neue Stage* überschrieben |

Die Namen der Schützen gibt die nutzende Person selbst ein. Es findet kein
Abgleich mit Kontakten, Konten oder anderen Quellen statt.

Diese Daten verbleiben auf dem Gerät und werden beim Deinstallieren der App
vollständig gelöscht.

## Berechtigungen

| Plattform | Berechtigung | Zweck |
| --- | --- | --- |
| iOS | `NSMicrophoneUsageDescription` | Schusserkennung |
| Android | `RECORD_AUDIO` | Schusserkennung |
| Android | `INTERNET` | technisch von der Web-Ansicht deklariert; die App ruft keine externen Inhalte ab |

## Keine Übermittlung an Dritte

Die App enthält keine Werbe-, Tracking- oder Analysebibliotheken und stellt im
Betrieb keine Netzwerkverbindungen her. Eine Übermittlung personenbezogener Daten
an Dritte findet nicht statt.

Unabhängig davon erheben Apple und Google beim Download und beim Betrieb von Apps
eigene Daten. Dafür gelten die Datenschutzbestimmungen des jeweiligen Anbieters.

## Rechtsgrundlage

Soweit überhaupt personenbezogene Daten verarbeitet werden, geschieht dies auf
Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung der angeforderten
Funktion). Die Mikrofonberechtigung wird zusätzlich über die Systemabfrage
eingeholt (Art. 6 Abs. 1 lit. a DSGVO) und kann jederzeit widerrufen werden.

## Rechte der betroffenen Personen

Da keine personenbezogenen Daten an die verantwortliche Stelle übermittelt werden,
liegen dort auch keine Daten vor, die Gegenstand von Auskunfts-, Berichtigungs-
oder Löschanfragen sein könnten. Alle in der App erzeugten Daten liegen
ausschließlich auf dem Gerät und unterliegen der Kontrolle der nutzenden Person.

## Kontakt

*(E-Mail-Adresse der verantwortlichen Stelle hier eintragen)*
