# ha-battery-cell-monitoring

Home Assistant Lovelace custom card for monitoring per-cell voltages of home battery storage systems (e.g. Marstek B2500).

## Features

- **Cell voltages chart** — all cells as bars on a zoomed Y axis; the lowest and highest voltage cells are highlighted in configurable colors (highlight is skipped when more than 3 cells share the value)
- **Status badge** — rates the **peak** spread with freely configurable levels (threshold, color, label); below the lowest threshold a non-deletable "Default" level applies (color configurable)
- **Warning hints** — freely configurable levels (threshold, color, hint text) rating the **peak** spread, e.g. "Perform balancing" / "Deactivate battery". A hint stays visible until the peak is reset; dismissing asks for confirmation
- **Stats row** — current min / mean / max / spread
- **Peak spread tracking** — highest observed spread with timestamp and reset button (with confirmation dialog). Peak and dismissed state are stored in an `input_text` helper, synced across all devices; localStorage is the fallback. Multiple card instances can share one helper
- **History chart** — colored band between the min and max curves (one closed SVG path, not filled to zero) with the mean as a separate line; optional smoothing (time-bucket aggregation + monotone cubic interpolation, overshoot-free, edges clamped against crossing); window, band/line colors configurable
- **UI editor** — card title, peak helper, batteries (add / remove / reorder, per-battery display switches), plus collapsible sections for status levels, warning hints, cell colors and the history chart. Text input is buffered (no focus loss while typing), structural changes keep the scroll position
- **Localized** — English and German, follows the HA UI language
- Works without template sensors — min/max/mean/spread are computed from the cell values when needed

## Installation

1. Add this repo as a HACS custom repository (category *Dashboard*) and install, or copy `ha-battery-cell-monitoring.js` to `config/www/` and register it as a JavaScript module resource
2. Create an `input_text` helper for the peaks (default name: `input_text.battery_cell_monitoring_peaks`, max length 255, initial `[]`)
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
```

### Card options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | – | Card heading |
| `peak_helper` | entity | `input_text.battery_cell_monitoring_peaks` | Helper storing peaks and dismissed state as a JSON array ordered by display position: `[{"i":<id>,"s":<mV>,"t":<timestamp>,"d":1?}, ...]` |
| `status_levels` | list | 20/50/200 mV | Status levels `{threshold, color, label}`; highest match wins |
| `status_base_color` | color | `#22c55e` | Color of the "Default" status below the lowest threshold |
| `warn_levels` | list | 100/350 mV | Warning hint levels `{threshold, color, text}`; highest match wins |
| `cell_color` | color | `#3b82f6` | Bar color of normal cells |
| `cell_min_color` | color | `#ef4444` | Bar color of the lowest-voltage cell(s) |
| `cell_max_color` | color | `#22c55e` | Bar color of the highest-voltage cell(s) |
| `history_minutes` | number | 60 | History chart window in minutes |
| `history_band_color` | color | `#3b82f6` | Band color (rendered at 30% opacity) |
| `history_line_color` | color | theme text color | Mean line color |
| `history_smooth` | bool | false | Smoothed curves instead of stepped raw history |

### Per battery

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | – | Display name |
| `entity_prefix` | string | – | Entity ID stem of the cell sensors (`sensor.` is prepended when no domain is given) |
| `cell_count` | number | – | Number of cells (1–32) |
| `digits` | number | 2 | Digits of the appended number |
| `first_cell` | number | 1 | First cell number |
| `cells` | list | – | Alternative: explicit entity list (takes precedence) |
| `spread` / `min` / `max` / `mean` | entity | computed | Optional template sensors (also used for the history chart) |
| `show_status` / `show_chart` / `show_stats` / `show_peak` | bool | true | Display options |
| `show_history` | bool | false | History chart (min/max band + mean line) |

## Spread assessment (LFP)

| Spread | Assessment |
|--------|------------|
| < 20 mV | Good |
| 20–50 mV | Watch |
| 50–200 mV | Balancing needed |
| > 200 mV | Critical (possible cell defect) |

LFP cells reveal problems almost exclusively at the SOC extremes (>90% / <10%). That is why badge and warning hints rate the tracked peak instead of the momentary spread.
