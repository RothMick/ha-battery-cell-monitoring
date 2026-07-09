# Batterie-KI-Analyse mit Claude Haiku

*(Documentation in German — the feature is an optional add-on to the card and targets German-speaking users; the YAML is commented in German as well.)*

Ein Home-Assistant-Agent, der die Batteriedaten regelmäßig per **Anthropic Messages API** an **Claude Haiku** (`claude-haiku-4-5`) schickt und eine kompakte Analyse zurückliefert zu:

1. **Batterienutzung** — SOC, aktuelles Lade-/Entladeverhalten
2. **Einspeisung** — wird eingespeist statt gespeichert?
3. **Input/Output-Gewichtung** — geladene vs. entladene Energie, grobe Wirkungsgrad-Einschätzung
4. **Fehler & Zellgesundheit** — Fehler-Entitäten plus LFP-Spread-Bewertung (passend zur Karte)
5. **Empfehlungen** — max. 3, konkret

Alles läuft nativ in Home Assistant (Package aus `rest_command`, Script, Template-Sensor und Automationen) — **kein Add-on, kein AppDaemon nötig**. Benötigt Home Assistant **2024.10 oder neuer**.

## Funktionsweise

```
Automation (täglich 20:30 / bei Fehler)
        │
        ▼
script.battery_ai_analyse          ← sammelt Entitätswerte, baut den Prompt
        │
        ▼
rest_command.battery_ai_analysis   ← POST https://api.anthropic.com/v1/messages
        │                            Modell: claude-haiku-4-5
        ▼
Event battery_ai_analysis_done
        │
        ▼
sensor.batterie_ki_analyse         ← Analyse-Text im Attribut "analysis",
                                     Zeitstempel als State
```

## Installation

### 1. API-Key hinterlegen

API-Key unter [console.anthropic.com](https://console.anthropic.com/) erstellen und in `secrets.yaml` eintragen:

```yaml
anthropic_api_key: "sk-ant-..."
```

> Den Key **niemals** direkt in YAML-Dateien schreiben, die in ein Repo wandern.

### 2. Package einbinden

Falls noch nicht geschehen, Packages in `configuration.yaml` aktivieren:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

Dann [`battery_ai_analysis.yaml`](battery_ai_analysis.yaml) nach `config/packages/` kopieren.

### 3. Entitäten anpassen

Im Script (`script.battery_ai_analyse`) den Block `KONFIGURATION` an die eigene Installation anpassen. Die vorbelegten Namen sind Beispiele — die tatsächlichen HM2MQTT-Entitäten heißen je nach Gerät anders (Entwicklerwerkzeuge → Zustände zum Nachschlagen):

| Variable | Bedeutung |
|----------|-----------|
| `soc_entity` | Ladezustand in % |
| `input_power_entity` | aktuelle Ladeleistung (PV → Akku) |
| `output_power_entity` | aktuelle Entladeleistung (Akku → Haus) |
| `feed_in_power_entity` | aktuelle Netzeinspeisung |
| `energy_in_today_entity` / `energy_out_today_entity` | heute geladene / entladene Energie (kWh) |
| `feed_in_today_entity` | heute eingespeiste Energie (kWh) |
| `cell_min/max/mean/spread_entity` | Zell-Template-Sensoren (siehe [Haupt-README](../README.md)) |
| `peak_helper_entity` | Peak-Helper der Karte (`input_text.battery_cell_monitoring_peaks`) |
| `error_entities` | Liste von Fehler-/Störungs-Entitäten |

Nicht vorhandene Sensoren auf `""` setzen — sie erscheinen dann als „unbekannt" im Prompt, und Claude weist darauf hin, statt zu spekulieren.

In der zweiten Automation (`Batterie KI-Analyse: bei Fehler`) außerdem die Trigger-Entität `binary_sensor.b2500_fault` anpassen oder die Automation entfernen.

### 4. Neu starten und testen

Nach dem Neustart: **Entwicklerwerkzeuge → Aktionen → `script.battery_ai_analyse`** ausführen. Danach sollte `sensor.batterie_ki_analyse` den Zeitstempel als State und die Analyse im Attribut `analysis` tragen. Schlägt der Aufruf fehl, erscheint eine persistente Benachrichtigung mit HTTP-Status und API-Antwort.

## Anzeige auf dem Dashboard

Markdown-Karte unterhalb der Zellspannungs-Karte:

```yaml
type: markdown
title: KI-Analyse (Claude Haiku)
content: >-
  {% set s = 'sensor.batterie_ki_analyse' %}
  {% if state_attr(s, 'analysis') %}
  {{ state_attr(s, 'analysis') }}

  ---
  *Stand: {{ as_timestamp(states(s)) | timestamp_custom('%d.%m.%Y %H:%M') }}
  · {{ state_attr(s, 'model') }}
  · {{ state_attr(s, 'input_tokens') }}/{{ state_attr(s, 'output_tokens') }} Tokens*
  {% else %}
  Noch keine Analyse vorhanden — `script.battery_ai_analyse` ausführen.
  {% endif %}
```

## Kosten

Claude Haiku 4.5 kostet $1 pro Mio. Input-Tokens und $5 pro Mio. Output-Tokens. Eine Analyse liegt typischerweise bei ~1.000 Input- und ~400 Output-Tokens, also **ca. $0,003 pro Lauf** — bei einer täglichen Analyse unter $0,10 pro Monat. Die tatsächlichen Tokens stehen nach jedem Lauf in den Sensor-Attributen `input_tokens` / `output_tokens`.

Für tiefere Analysen kann im Script `ai_model` z. B. auf `claude-opus-4-8` umgestellt werden (deutlich leistungsfähiger, höherer Preis pro Token).

## Anpassen der Analyse

- **Zeitpunkt/Frequenz:** Trigger der Automation `Batterie KI-Analyse: täglich` ändern (Standard 20:30, wenn die Tageswerte weitgehend vollständig sind).
- **Prompt:** `system_prompt` im Script definiert Abschnitte, Sprache und Länge; `user_prompt` die Datenbasis. Weitere Entitäten lassen sich einfach als zusätzliche Zeilen ergänzen.
- **Antwortlänge:** `ai_max_tokens` (Standard 2000).

## Alternative: offizielle Anthropic-Integration

Statt des `rest_command` kann auch die [offizielle Anthropic-Integration](https://www.home-assistant.io/integrations/anthropic/) genutzt werden (`conversation.process` mit einem auf Haiku konfigurierten Agenten). Der hier gewählte direkte API-Weg braucht keine Integration, macht den Prompt vollständig transparent und erlaubt die freie Modellwahl pro Aufruf.

## Fehlerbehebung

| Symptom | Ursache / Lösung |
|---------|------------------|
| Persistente Benachrichtigung mit Status 401 | API-Key falsch oder fehlt in `secrets.yaml` |
| Status 400 | Payload-Problem — Meldung in der Benachrichtigung lesen (z. B. ungültiges Modell) |
| Status 429 | Rate-Limit — Frequenz der Automation reduzieren |
| Sensor bleibt leer | Event kam nicht an: Script-Trace ansehen (Einstellungen → Automationen & Szenen → Skripte) |
| Viele Werte „unbekannt" | Entitäts-IDs im `KONFIGURATION`-Block prüfen |
