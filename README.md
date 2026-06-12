# ha-battery-cell-monitoring

Home Assistant Lovelace custom card for monitoring per-cell voltages of home battery storage systems (e.g. Marstek B2500).

## Features

- **Cell bar chart** — all cells on a zoomed Y axis, outliers highlighted (yellow >20 mV, red >50 mV deviation from mean)
- **Status badge** — color-coded spread status: green (<20 mV) / yellow (watch) / orange (balancing needed) / red (critical)
- **Warning banner** — appears on elevated spread, dismissible (localStorage)
- **Stats row** — min / mean / max / spread
- **Peak spread tracking** — highest observed spread is kept with a timestamp, reset button; stored in an `input_text` helper so the value is identical on all devices (falls back to localStorage when no helper exists)
- **UI editor** — card title, batteries (add / remove / reorder), entity stem with cell count and digits, display options via switches
- **Multiple batteries** in one card
- **Localized** — English and German, follows the Home Assistant UI language
- Works without template sensors — min/max/mean/spread are computed from the cell values when needed

## Installation

1. Copy `ha-battery-cell-monitoring.js` to `config/www/` (or add this repo as a HACS custom repository)
2. Register the resource: Settings → Dashboards → Resources →
   `/local/ha-battery-cell-monitoring.js`, type **JavaScript module**
3. Add the card: pick "Battery Cell Monitoring" from the card picker — configuration is fully available in the UI

## Configuration

Fully configurable via the UI editor, or via YAML (see [example-card.yaml](example-card.yaml)):

```yaml
type: custom:ha-battery-cell-monitoring
title: Cell voltage analysis
batteries:
  - name: B2500 (West)
    entity_prefix: hame_energy_hmj_2_xxxx_cell_voltage_host_  # "sensor." is added automatically
    cell_count: 14
    digits: 2          # _01, _02, ... _14
    show_status: true  # status badge
    show_chart: true   # bar chart
    show_stats: true   # min/mean/max/spread
    show_peak: true    # peak spread with reset
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | – | Card heading |
| `peak_helper` | entity | `input_text.battery_cell_monitoring_peaks` | `input_text` helper storing the peaks as a JSON array ordered by display position: `[{"i":<battery id>,"s":<spread mV>,"t":<timestamp>}, ...]` |
| `warn_thresholds.watch` | number | 20 | mV threshold yellow |
| `warn_thresholds.balance` | number | 50 | mV threshold orange |
| `warn_thresholds.critical` | number | 200 | mV threshold red |

### Per battery

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | – | Display name |
| `entity_prefix` | string | – | Entity ID stem of the cell sensors (`sensor.` is prepended automatically when no domain is given) |
| `cell_count` | number | – | Number of cells (1–32) |
| `digits` | number | 2 | Digits of the appended number |
| `first_cell` | number | 1 | First cell number |
| `cells` | list | – | Alternative: explicit entity list (takes precedence) |
| `spread` / `min` / `max` / `mean` | entity | computed | Optional template sensors |
| `show_status` / `show_chart` / `show_stats` / `show_peak` | bool | true | Display options |

## Spread assessment (LFP)

| Spread | Assessment |
|--------|------------|
| < 20 mV | Good |
| 20–50 mV | Watch |
| 50–200 mV | Balancing needed |
| > 200 mV | Critical (possible cell defect) |

Note: LFP cells reveal problems almost exclusively at the SOC extremes (>90% / <10%). That is why the peak tracking keeps the highest measured value.
