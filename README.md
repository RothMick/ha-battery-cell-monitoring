# ha-battery-cell-monitoring

Home Assistant Lovelace custom card for monitoring per-cell voltages of home battery storage systems (e.g. Marstek B2500).

<img width="521" height="443" alt="ha-battery-cell-monitoring_preview_dark" src="https://github.com/user-attachments/assets/62057891-d2e7-47e3-946f-27fb13b6bd2d" />


## Features

- **Cell voltages chart** — all cells as bars on a zoomed Y axis; the lowest and highest voltage cells are highlighted in configurable colors (highlight is skipped when more than 3 cells share the value)
- **Status badge** — rates the **peak** spread with freely configurable levels (threshold, color, label); below the lowest threshold a non-deletable "Default" level applies (color configurable)
- **Warning hints** — freely configurable levels (threshold, color, hint text) rating the **peak** spread, e.g. "Perform balancing" / "Deactivate battery". A hint stays visible until the peak is reset; dismissing asks for confirmation
- **Stats row** — current min / mean / max / spread
- **Peak spread tracking** — highest observed spread with timestamp and reset button (with confirmation dialog). Peak and dismissed state are stored in an `input_text` helper, synced across all devices; localStorage is the fallback. Multiple card instances can share one helper
- **History chart** — colored band between the min and max curves (one closed SVG path, not filled to zero), the min/max boundaries drawn as lines and the mean as a separate line — each with its own configurable color; optional smoothing (time-bucket aggregation + monotone cubic interpolation, overshoot-free; the mean is placed by its relative position inside the band so it never sticks to an edge); window configurable
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
| `history_band_color` | color | `#3b82f6` | Band fill color (drawn opaque, exactly as configured) |
| `history_line_color` | color | theme text color | Mean line color |
| `history_edge_color` | color | `#ff0000` | Min/max boundary line color |
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
| `show_status` / `show_chart` / `show_stats` / `show_peak` | bool | true | Display options |
| `show_history` | bool | false | History chart (min/max band + mean line) |

#### Optional template sensors

Configurable in the UI editor under **History chart → Template sensors (optional)**:

| Option | Description |
|--------|-------------|
| `min` | Template sensor for the minimum cell voltage |
| `max` | Template sensor for the maximum cell voltage |
| `mean` | Template sensor for the mean cell voltage |
| `spread` | Template sensor for the cell voltage spread |

When `min` / `max` / `mean` are set, the history chart fetches only these 3 entity histories instead of all individual cell entities — functionally identical, fewer network requests. The `spread` sensor improves the momentary spread value in the stats row (falls back to `max − min` computed from cells).

All four are optional. The card works fully without them; they are only relevant when `show_history: true` is used.

## Spread assessment (LFP)

| Spread | Assessment |
|--------|------------|
| < 20 mV | Good |
| 20–50 mV | Watch |
| 50–200 mV | Balancing needed |
| > 200 mV | Critical (possible cell defect) |

LFP cells reveal problems almost exclusively at the SOC extremes (>90% / <10%). That is why badge and warning hints rate the tracked peak instead of the momentary spread.

## Full example

Card configuration with all entities (see also [example-card.yaml](example-card.yaml)):

```yaml
type: custom:ha-battery-cell-monitoring
title: Cell voltage analysis
peak_helper: input_text.battery_cell_monitoring_peaks
history_minutes: 60
history_smooth: true
batteries:
  - name: B2500 (West)
    entity_prefix: hame_energy_hmj_2_abcdefgh1234_cell_voltage_host_
    cell_count: 14
    digits: 2
    show_history: true
    # optional template sensors (fallback: computed from the cells)
    min: sensor.b2500_1234_cell_voltage_min
    max: sensor.b2500_1234_cell_voltage_max
    mean: sensor.b2500_1234_cell_voltage_mean
    spread: sensor.b2500_1234_cell_voltage_spread
```

The cell entities resolved from `entity_prefix` / `cell_count` / `digits`:

```yaml
sensor.hame_energy_hmj_2_abcdefgh1234_cell_voltage_host_01
sensor.hame_energy_hmj_2_abcdefgh1234_cell_voltage_host_02
# ...
sensor.hame_energy_hmj_2_abcdefgh1234_cell_voltage_host_14
```

Template sensors for `configuration.yaml` (optional, recommended when `show_history` is on):

```yaml
template:
  - sensor:
      - name: "B2500 1234 cell voltage min"
        unique_id: b2500_1234_cell_voltage_min
        unit_of_measurement: "V"
        state_class: measurement
        state: >
          {% set ns = namespace(cells=[]) %}
          {% for i in range(1, 15) %}
            {% set v = states('sensor.hame_energy_hmj_2_abcdefgh1234_cell_voltage_host_' ~ '%02d' % i) | float(0) %}
            {% if v > 0 %}{% set ns.cells = ns.cells + [v] %}{% endif %}
          {% endfor %}
          {{ (ns.cells | min | round(3)) if ns.cells else 'unavailable' }}
      - name: "B2500 1234 cell voltage max"
        unique_id: b2500_1234_cell_voltage_max
        unit_of_measurement: "V"
        state_class: measurement
        state: >
          {% set ns = namespace(cells=[]) %}
          {% for i in range(1, 15) %}
            {% set v = states('sensor.hame_energy_hmj_2_abcdefgh1234_cell_voltage_host_' ~ '%02d' % i) | float(0) %}
            {% if v > 0 %}{% set ns.cells = ns.cells + [v] %}{% endif %}
          {% endfor %}
          {{ (ns.cells | max | round(3)) if ns.cells else 'unavailable' }}
      - name: "B2500 1234 cell voltage mean"
        unique_id: b2500_1234_cell_voltage_mean
        unit_of_measurement: "V"
        state_class: measurement
        state: >
          {% set ns = namespace(cells=[]) %}
          {% for i in range(1, 15) %}
            {% set v = states('sensor.hame_energy_hmj_2_abcdefgh1234_cell_voltage_host_' ~ '%02d' % i) | float(0) %}
            {% if v > 0 %}{% set ns.cells = ns.cells + [v] %}{% endif %}
          {% endfor %}
          {{ (ns.cells | average | round(3)) if ns.cells else 'unavailable' }}
      - name: "B2500 1234 cell voltage spread"
        unique_id: b2500_1234_cell_voltage_spread
        unit_of_measurement: "mV"
        state_class: measurement
        state: >
          {% set ns = namespace(cells=[]) %}
          {% for i in range(1, 15) %}
            {% set v = states('sensor.hame_energy_hmj_2_abcdefgh1234_cell_voltage_host_' ~ '%02d' % i) | float(0) %}
            {% if v > 0 %}{% set ns.cells = ns.cells + [v] %}{% endif %}
          {% endfor %}
          {{ (((ns.cells | max) - (ns.cells | min)) * 1000) | round(0) if ns.cells else 'unavailable' }}
```

Peak helper (Settings → Devices & services → Helpers → Text):

```yaml
input_text:
  battery_cell_monitoring_peaks:
    name: Battery cell monitoring peaks
    initial: "[]"
    max: 255
```
