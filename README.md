# Shot Timer

Dieses Paket enthält den vollständigen aktuellen Stand des Shot-Timer-Prototyps.

## Inhalt

- `dist/index.html` – Oberfläche, Styling und gesamte App-Logik
- `dist/assets/standby.mp3` – Standby-Ansage
- `dist/assets/pact-beep.mp3` – Start- und Par-Signal
- `.openai/hosting.json` – Konfiguration der veröffentlichten Vorschau

## Lokal starten

Für die reine Oberfläche kann `dist/index.html` direkt im Browser geöffnet werden.
Der Mikrofonzugriff funktioniert in modernen Browsern normalerweise nur über HTTPS oder über einen lokalen Webserver.

Beispiel im Projektordner:

```bash
python -m http.server 8080 --directory dist
```

Anschließend im Browser `http://localhost:8080` öffnen.

## Hinweis zur iOS-Version

Dieses Paket ist die Web-App. Für eine Veröffentlichung im Apple App Store muss daraus noch ein signiertes iOS-Projekt erstellt werden, beispielsweise als Hybrid-App mit einer nativen Audioerkennung.
