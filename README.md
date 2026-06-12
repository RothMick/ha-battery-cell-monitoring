# ha-battery-cell-monitoring

Home Assistant Lovelace Custom Card zur Überwachung von Einzelzellspannungen in Batteriespeichern (z. B. Marstek B2500).

## Features

- **Zellen-Balkendiagramm** — alle Zellen auf gezoomter Y-Achse, Ausreißer farblich markiert (gelb >20 mV, rot >50 mV Abweichung vom Mittelwert)
- **Zustand-Badge** — farbkodierter Spread-Status: grün (<20 mV) / gelb (Beobachten) / orange (Balancing nötig) / rot (Kritisch)
- **Warn-Banner** — erscheint bei erhöhtem Spread, dismissbar (localStorage)
- **Werte-Zeile** — Min / Mean / Max / Spread
- **Peak-Spread-Tracking** — höchster gesehener Spread bleibt mit Timestamp stehen, Reset-Button (localStorage, pro Browser)
- **UI-Editor** — Titel, Batterien (hinzufügen/entfernen/umsortieren), Entity-Stamm mit Zellanzahl/Stellen, Anzeige-Optionen per Switch
- **Mehrere Batterien** in einer Kachel
- Funktioniert ohne Template-Sensoren — Min/Max/Mean/Spread werden bei Bedarf aus den Zellwerten berechnet

## Installation

1. `ha-battery-cell-monitoring.js` nach `config/www/` kopieren (oder via HACS als Custom Repository)
2. Ressource registrieren: Einstellungen → Dashboards → Ressourcen →
   `/local/ha-battery-cell-monitoring.js`, Typ **JavaScript-Modul**
3. Karte hinzufügen: „Battery Cell Monitoring" im Karten-Picker wählen — Konfiguration komplett per UI möglich

## Konfiguration

Vollständig über den UI-Editor oder per YAML, siehe [example-card.yaml](example-card.yaml):

```yaml
type: custom:ha-battery-cell-monitoring
title: Zellspannungsanalyse
batteries:
  - name: B2500 (West)
    entity_prefix: sensor.hame_energy_hmj_2_xxxx_cell_voltage_host_
    cell_count: 14
    digits: 2          # _01, _02, ... _14
    show_status: true  # Zustand-Badge
    show_chart: true   # Balkendiagramm
    show_stats: true   # Min/Mean/Max/Spread
    show_peak: true    # Peak-Spread mit Reset
```

### Optionen

| Option | Typ | Default | Beschreibung |
|--------|-----|---------|--------------|
| `title` | string | – | Überschrift der Kachel |
| `warn_thresholds.watch` | number | 20 | mV-Schwelle gelb |
| `warn_thresholds.balance` | number | 50 | mV-Schwelle orange |
| `warn_thresholds.critical` | number | 200 | mV-Schwelle rot |

### Pro Batterie

| Option | Typ | Default | Beschreibung |
|--------|-----|---------|--------------|
| `name` | string | – | Anzeigename |
| `entity_prefix` | string | – | Entity-ID-Stamm der Zellsensoren |
| `cell_count` | number | – | Anzahl Zellen (1–32) |
| `digits` | number | 2 | Stellen der angehängten Nummer |
| `first_cell` | number | 1 | Erste Zellnummer |
| `cells` | list | – | Alternativ: explizite Entity-Liste (hat Vorrang) |
| `spread` / `min` / `max` / `mean` | entity | berechnet | Optionale Template-Sensoren |
| `show_status` / `show_chart` / `show_stats` / `show_peak` | bool | true | Anzeige-Optionen |

## Spread-Bewertung (LFP)

| Spread | Bewertung |
|--------|-----------|
| < 20 mV | Gut |
| 20–50 mV | Beobachten |
| 50–200 mV | Balancing nötig |
| > 200 mV | Kritisch (Zelldefekt möglich) |

Hinweis: LFP-Zellen zeigen Probleme fast nur an den SOC-Extremen (>90 % / <10 %). Deshalb hält das Peak-Tracking den höchsten gemessenen Wert fest.
