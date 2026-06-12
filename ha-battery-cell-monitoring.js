/**
 * ha-battery-cell-monitoring
 * Lovelace card: per-cell voltages, spread analysis and peak tracking
 * for home battery storage systems (e.g. Marstek B2500).
 *
 * Config (prefix based):
 *   type: custom:ha-battery-cell-monitoring
 *   title: Cell voltage analysis
 *   batteries:
 *     - name: B2500 (West)
 *       entity_prefix: hame_energy_hmj_2_xxxx_cell_voltage_host_   # "sensor." is added automatically
 *       cell_count: 14
 *       digits: 2
 *       show_status: true   # colored badge top right
 *       show_chart: true    # cell bar chart
 *       show_stats: true    # min/mean/max/spread row
 *       show_peak: true     # peak spread with timestamp + reset
 *
 * Legacy configs with cells:[...] and spread/min/max/mean entities
 * keep working (an explicit cells array takes precedence).
 */

// --- i18n ---------------------------------------------------------------

const BCM_TRANSLATIONS = {
  en: {
    status_good:      'Good',
    status_watch:     'Watch',
    status_balance:   'Balancing needed',
    status_critical:  'Critical',
    no_data:          'No data',
    spread:           'Spread',
    min:              'Min',
    mean:             'Mean',
    max:              'Max',
    peak_label:       'Peak spread:',
    dismiss:          'Dismiss',
    reset_peak:       'Reset peak',
    battery:          'Battery',
    card_title:       'Card title',
    label_name:       'Name',
    label_prefix:     'Entity stem of the cells',
    label_cell_count: 'Number of cells',
    label_digits:     'Digits of the number',
    display:          'Display',
    opt_status:       'Status (badge)',
    opt_chart:        'Bar chart',
    opt_stats:        'Values (min/mean/max/spread)',
    opt_peak:         'Spread peak with reset',
    add_battery:      '+ Add battery',
    move_up:          'Move up',
    move_down:        'Move down',
    remove:           'Remove',
  },
  de: {
    status_good:      'Gut',
    status_watch:     'Beobachten',
    status_balance:   'Balancing nötig',
    status_critical:  'Kritisch',
    no_data:          'Keine Daten',
    spread:           'Spread',
    min:              'Min',
    mean:             'Mean',
    max:              'Max',
    peak_label:       'Peak-Spread:',
    dismiss:          'Schließen',
    reset_peak:       'Peak zurücksetzen',
    battery:          'Batterie',
    card_title:       'Titel der Kachel',
    label_name:       'Bezeichnung',
    label_prefix:     'Entity-Stamm der Zellen',
    label_cell_count: 'Anzahl Zellen',
    label_digits:     'Stellen der Nummer',
    display:          'Anzeige',
    opt_status:       'Zustand (Badge)',
    opt_chart:        'Balkendiagramm',
    opt_stats:        'Werte (Min/Mean/Max/Spread)',
    opt_peak:         'Spread-Peak mit Reset',
    add_battery:      '+ Batterie hinzufügen',
    move_up:          'Nach oben',
    move_down:        'Nach unten',
    remove:           'Entfernen',
  },
};

function bcmLang(hass) {
  const lang = (hass?.locale?.language || hass?.language || 'en').substring(0, 2);
  return BCM_TRANSLATIONS[lang] ? lang : 'en';
}

function bcmT(hass, key) {
  return BCM_TRANSLATIONS[bcmLang(hass)][key] ?? BCM_TRANSLATIONS.en[key] ?? key;
}

// Prepend "sensor." when the stem has no domain part.
function bcmNormalizePrefix(prefix) {
  const p = (prefix || '').trim();
  if (!p) return '';
  return p.includes('.') ? p : 'sensor.' + p;
}

// --- card ---------------------------------------------------------------

class BatteryCellMonitoringCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    if (!config.batteries?.length) throw new Error('"batteries" array required');
    this._config = config;
    this._thresholds = {
      watch:    config.warn_thresholds?.watch    ?? 20,
      balance:  config.warn_thresholds?.balance  ?? 50,
      critical: config.warn_thresholds?.critical ?? 200,
    };
  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    if (!old || this._entitiesChanged(old, hass)) this._render();
  }

  _t(key) { return bcmT(this._hass, key); }

  _cellIds(battery) {
    if (Array.isArray(battery.cells) && battery.cells.length) return battery.cells;
    const prefix = bcmNormalizePrefix(battery.entity_prefix);
    if (!prefix) return [];
    const count  = parseInt(battery.cell_count, 10) || 0;
    const digits = parseInt(battery.digits, 10) || 2;
    const start  = parseInt(battery.first_cell, 10) || 1;
    const ids = [];
    for (let i = 0; i < count; i++) {
      ids.push(prefix + String(start + i).padStart(digits, '0'));
    }
    return ids;
  }

  _trackedIds(battery) {
    return [...this._cellIds(battery), battery.spread, battery.min, battery.max, battery.mean]
      .filter(Boolean);
  }

  _entitiesChanged(oldHass, newHass) {
    return this._config.batteries.some(b =>
      this._trackedIds(b).some(id => oldHass.states[id] !== newHass.states[id])
    );
  }

  // --- helpers ---

  _batteryKey(battery) {
    return battery.id || battery.entity_prefix || battery.name || 'battery';
  }

  _spreadColor(mv) {
    if (mv > this._thresholds.critical) return '#ef4444';
    if (mv > this._thresholds.balance)  return '#f97316';
    if (mv > this._thresholds.watch)    return '#eab308';
    return '#22c55e';
  }

  _spreadLabel(mv) {
    if (mv > this._thresholds.critical) return this._t('status_critical');
    if (mv > this._thresholds.balance)  return this._t('status_balance');
    if (mv > this._thresholds.watch)    return this._t('status_watch');
    return this._t('status_good');
  }

  _peakKey(key)    { return 'bcm_peak_' + key; }
  _dismissKey(key) { return 'bcm_dismiss_' + key; }

  _getPeak(key) {
    try {
      const d = JSON.parse(localStorage.getItem(this._peakKey(key)));
      return d || null;
    } catch { return null; }
  }

  _updatePeak(key, spreadMv) {
    const rounded = Math.round(spreadMv);
    const current = this._getPeak(key);
    if (!current || rounded > current.spread) {
      const now = new Date();
      const locale = bcmLang(this._hass) === 'de' ? 'de-DE' : 'en-GB';
      const ts = now.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
               + ' ' + now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      localStorage.setItem(this._peakKey(key), JSON.stringify({ spread: rounded, ts }));
    }
  }

  _resetPeak(key) {
    localStorage.removeItem(this._peakKey(key));
    this._render();
  }

  _isDismissed(key, spreadMv) {
    try {
      const d = JSON.parse(localStorage.getItem(this._dismissKey(key)));
      return d && d.spread >= Math.round(spreadMv);
    } catch { return false; }
  }

  _dismiss(key) {
    const battery = this._config.batteries.find(b => this._batteryKey(b) === key);
    if (!battery) return;
    const data = this._data(battery);
    if (!data) return;
    localStorage.setItem(this._dismissKey(key), JSON.stringify({ spread: Math.round(data.spreadMv) }));
    this._render();
  }

  _stateVal(entityId) {
    const s = this._hass?.states[entityId];
    if (!s || s.state === 'unavailable' || s.state === 'unknown') return null;
    const v = parseFloat(s.state);
    return isNaN(v) ? null : v;
  }

  _data(battery) {
    const cells = this._cellIds(battery).map(id => this._stateVal(id)).filter(v => v !== null);
    if (!cells.length) return null;
    const cellMin = Math.min(...cells);
    const cellMax = Math.max(...cells);
    // Fall back to values computed from the cells when no template sensors
    // are configured or they are unavailable.
    return {
      cells,
      spreadMv: this._stateVal(battery.spread) ?? (cellMax - cellMin) * 1000,
      min:      this._stateVal(battery.min)    ?? cellMin,
      max:      this._stateVal(battery.max)    ?? cellMax,
      mean:     this._stateVal(battery.mean)   ?? cells.reduce((a, b) => a + b, 0) / cells.length,
    };
  }

  // --- render ---

  _renderChart(cells, mean) {
    const H = 64, barW = 14, gap = 3, padY = 4;
    const innerH = H - padY * 2;
    const yMin = Math.min(...cells) - 0.012;
    const yMax = Math.max(...cells) + 0.012;
    const yRange = yMax - yMin || 0.001;
    const toY = v => H - padY - ((v - yMin) / yRange) * innerH;
    const bars = cells.map((v, i) => {
      const x    = i * (barW + gap);
      const top  = toY(v);
      const bot  = toY(yMin);
      const h    = Math.max(bot - top, 2);
      const diff = Math.abs(v - mean) * 1000;
      const fill = diff > 50 ? '#ef4444' : diff > 20 ? '#eab308' : '#3b82f6';
      return '<rect x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barW + '" height="' + h.toFixed(1) + '" fill="' + fill + '" rx="2"/>';
    }).join('');
    const totalW = cells.length * (barW + gap) - gap;
    const my = toY(mean).toFixed(1);
    const meanLine = '<line x1="0" y1="' + my + '" x2="' + totalW + '" y2="' + my + '" stroke="rgba(255,255,255,0.45)" stroke-width="1" stroke-dasharray="4,3"/>';
    return '<svg viewBox="0 0 ' + totalW + ' ' + H + '" class="cell-chart" preserveAspectRatio="none">' + bars + meanLine + '</svg>';
  }

  _renderBattery(battery) {
    const data = this._data(battery);
    const name = battery.name || this._t('battery');
    if (!data) {
      return '<div class="battery-section"><div class="battery-header"><span class="battery-name">' + name + '</span></div><p class="unavailable">' + this._t('no_data') + '</p></div>';
    }

    const { cells, spreadMv, min, max, mean } = data;
    const key = this._batteryKey(battery);

    const showStatus = battery.show_status !== false;
    const showChart  = battery.show_chart  !== false;
    const showStats  = battery.show_stats  !== false;
    const showPeak   = battery.show_peak   !== false;

    if (showPeak) this._updatePeak(key, spreadMv);
    const peak = showPeak ? this._getPeak(key) : null;

    const color = this._spreadColor(spreadMv);
    const label = this._spreadLabel(spreadMv);
    const showWarn = showStatus && spreadMv > this._thresholds.watch && !this._isDismissed(key, spreadMv);

    const badge = showStatus
      ? '<span class="spread-badge" style="color:' + color + ';border-color:' + color + ';">' + Math.round(spreadMv) + ' mV – ' + label + '</span>'
      : '';

    const warnHtml = showWarn
      ? '<div class="warn-banner" style="border-color:' + color + ';background:' + color + '18;"><span class="warn-icon">⚠</span><span class="warn-text">' + this._t('spread') + ' ' + Math.round(spreadMv) + ' mV — ' + label + '</span><button class="warn-dismiss" data-key="' + key + '" title="' + this._t('dismiss') + '">✕</button></div>'
      : '';

    const fmt = v => v.toFixed(3) + ' V';

    let chartHtml = '';
    if (showChart) {
      const cellLabels = cells.map((_, i) => '<span>' + (i + 1) + '</span>').join('');
      chartHtml = this._renderChart(cells, mean) + '<div class="cell-labels">' + cellLabels + '</div>';
    }

    const statsHtml = showStats
      ? '<div class="stats-row">'
        + '<div class="stat"><span class="stat-lbl">' + this._t('min') + '</span><span class="stat-val">' + fmt(min) + '</span></div>'
        + '<div class="stat"><span class="stat-lbl">' + this._t('mean') + '</span><span class="stat-val">' + fmt(mean) + '</span></div>'
        + '<div class="stat"><span class="stat-lbl">' + this._t('max') + '</span><span class="stat-val">' + fmt(max) + '</span></div>'
        + '<div class="stat"><span class="stat-lbl">' + this._t('spread') + '</span><span class="stat-val" style="color:' + color + ';">' + Math.round(spreadMv) + ' mV</span></div>'
        + '</div>'
      : '';

    let peakHtml = '';
    if (showPeak) {
      const peakColor = peak ? this._spreadColor(peak.spread) : '#22c55e';
      const peakVal   = peak ? peak.spread + ' mV' : '-';
      const peakTs    = peak ? '<span class="peak-ts">' + peak.ts + '</span>' : '';
      const peakReset = peak ? '<button class="peak-reset" data-key="' + key + '" title="' + this._t('reset_peak') + '">↺</button>' : '';
      peakHtml = '<div class="peak-row">'
        + '<span class="peak-label">' + this._t('peak_label') + '</span>'
        + '<span class="peak-val" style="color:' + peakColor + ';">' + peakVal + '</span>'
        + peakTs + peakReset
        + '</div>';
    }

    return '<div class="battery-section">'
      + '<div class="battery-header"><span class="battery-name">' + name + '</span>' + badge + '</div>'
      + warnHtml + chartHtml + statsHtml + peakHtml
      + '</div>';
  }

  _render() {
    if (!this._hass || !this._config) return;

    const sections = this._config.batteries.map(b => this._renderBattery(b)).join('<div class="divider"></div>');

    this.shadowRoot.innerHTML = '<style>'
      + ':host{display:block}'
      + 'ha-card{padding:16px 16px 12px}'
      + '.card-title{font-size:var(--ha-card-header-font-size,24px);font-weight:400;line-height:1.2;color:var(--ha-card-header-color,var(--primary-text-color));margin-bottom:14px}'
      + '.battery-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}'
      + '.battery-name{font-size:16px;font-weight:500;color:var(--primary-text-color)}'
      + '.spread-badge{font-size:12px;font-weight:700;padding:3px 10px;border:1.5px solid;border-radius:14px;white-space:nowrap}'
      + '.cell-chart{width:100%;height:64px;display:block;overflow:visible}'
      + '.cell-labels{display:flex;margin-top:3px}'
      + '.cell-labels span{flex:1;text-align:center;font-size:10px;color:var(--secondary-text-color)}'
      + '.stats-row{display:flex;gap:6px;margin-top:10px}'
      + '.stat{flex:1;display:flex;flex-direction:column;align-items:center;background:var(--secondary-background-color);border-radius:8px;padding:6px 2px}'
      + '.stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--secondary-text-color)}'
      + '.stat-val{font-size:14px;font-weight:500;color:var(--primary-text-color);margin-top:2px}'
      + '.peak-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 10px;background:var(--secondary-background-color);border-radius:8px}'
      + '.peak-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--secondary-text-color);flex-shrink:0}'
      + '.peak-val{font-size:14px;font-weight:700;flex-shrink:0}'
      + '.peak-ts{font-size:11px;color:var(--secondary-text-color);flex:1}'
      + '.peak-reset{background:none;border:none;cursor:pointer;color:var(--secondary-text-color);font-size:14px;padding:0 2px;line-height:1;flex-shrink:0}'
      + '.peak-reset:hover{color:var(--primary-text-color)}'
      + '.divider{height:1px;background:var(--divider-color);margin:14px 0}'
      + '.warn-banner{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;border:1px solid;margin-bottom:10px}'
      + '.warn-icon{font-size:15px;flex-shrink:0}'
      + '.warn-text{flex:1;font-size:14px;font-weight:500;color:var(--primary-text-color)}'
      + '.warn-dismiss{background:none;border:none;cursor:pointer;padding:0 2px;color:var(--secondary-text-color);font-size:14px;line-height:1}'
      + '.warn-dismiss:hover{color:var(--primary-text-color)}'
      + '.unavailable{font-size:13px;font-style:italic;color:var(--secondary-text-color)}'
      + '</style>'
      + '<ha-card>'
      + (this._config.title ? '<div class="card-title">' + this._config.title + '</div>' : '')
      + sections
      + '</ha-card>';

    this.shadowRoot.querySelectorAll('.warn-dismiss').forEach(btn => {
      btn.addEventListener('click', () => this._dismiss(btn.dataset.key));
    });
    this.shadowRoot.querySelectorAll('.peak-reset').forEach(btn => {
      btn.addEventListener('click', () => this._resetPeak(btn.dataset.key));
    });
  }

  getCardSize() { return (this._config?.batteries?.length ?? 1) * 3; }

  static getConfigElement() {
    return document.createElement('ha-battery-cell-monitoring-editor');
  }

  static getStubConfig() {
    return {
      title: 'Battery Cell Monitoring',
      batteries: [
        { name: 'Battery 1', entity_prefix: '', cell_count: 14, digits: 2,
          show_status: true, show_chart: true, show_stats: true, show_peak: true },
      ],
    };
  }
}

// --- editor -------------------------------------------------------------

class BatteryCellMonitoringEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._editing = false;
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll('ha-form').forEach(f => { f.hass = hass; });
  }

  _t(key) { return bcmT(this._hass, key); }

  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config || {}));
    if (!Array.isArray(this._config.batteries)) this._config.batteries = [];
    if (this._editing) return; // own change -> skip re-render to keep focus
    const scroller = this._findScroller();
    const saved = scroller ? scroller.scrollTop : null;
    this._render();
    if (scroller != null && saved != null) {
      requestAnimationFrame(() => { scroller.scrollTop = saved; });
    }
  }

  _findScroller() {
    let node = this;
    while (node) {
      const next = node.parentElement || (node.getRootNode && node.getRootNode().host);
      if (!next) return null;
      if (next.scrollHeight > next.clientHeight + 1) return next;
      node = next;
    }
    return null;
  }

  _fire(rerender = false) {
    this._editing = !rerender;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: JSON.parse(JSON.stringify(this._config)) },
      bubbles: true,
      composed: true,
    }));
    if (rerender) this._render();
    this._editing = false;
  }

  _moveBattery(idx, dir) {
    const arr = this._config.batteries;
    const to = idx + dir;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    this._fire(true);
  }

  _removeBattery(idx) {
    this._config.batteries.splice(idx, 1);
    this._fire(true);
  }

  _addBattery() {
    this._config.batteries.push({
      name: this._t('battery') + ' ' + (this._config.batteries.length + 1),
      entity_prefix: '',
      cell_count: 14,
      digits: 2,
      show_status: true,
      show_chart: true,
      show_stats: true,
      show_peak: true,
    });
    this._fire(true);
  }

  _batterySchema() {
    return [
      { name: 'name', label: this._t('label_name'), selector: { text: {} } },
      { name: 'entity_prefix', label: this._t('label_prefix'), selector: { text: {} } },
      { type: 'grid', name: '', schema: [
        { name: 'cell_count', label: this._t('label_cell_count'), selector: { number: { min: 1, max: 32, mode: 'box' } } },
        { name: 'digits', label: this._t('label_digits'), selector: { number: { min: 1, max: 3, mode: 'box' } } },
      ]},
    ];
  }

  _batteryFormData(b) {
    return {
      name:          b.name || '',
      entity_prefix: b.entity_prefix || '',
      cell_count:    b.cell_count ?? 14,
      digits:        b.digits ?? 2,
    };
  }

  _applyBatteryForm(idx, values) {
    const b = this._config.batteries[idx];
    if (!b) return;
    b.name          = values.name || '';
    b.entity_prefix = values.entity_prefix || '';
    b.cell_count    = parseInt(values.cell_count, 10) || 1;
    b.digits        = parseInt(values.digits, 10) || 1;
    // Drop a legacy cells array once the prefix mode is used.
    if (b.entity_prefix && Array.isArray(b.cells)) delete b.cells;
    this._fire(false);
  }

  _toggleOption(idx, option, checked) {
    const b = this._config.batteries[idx];
    if (!b) return;
    b[option] = checked;
    this._fire(false);
  }

  _optionRows(i, b) {
    const opts = [
      ['show_status', this._t('opt_status')],
      ['show_chart',  this._t('opt_chart')],
      ['show_stats',  this._t('opt_stats')],
      ['show_peak',   this._t('opt_peak')],
    ];
    return '<div class="options">'
      + '<div class="options-title">' + this._t('display') + '</div>'
      + opts.map(([key, label]) =>
        '<div class="opt-row">'
        + '<ha-switch id="opt-' + i + '-' + key + '" data-idx="' + i + '" data-option="' + key + '"' + (b[key] !== false ? ' checked' : '') + '></ha-switch>'
        + '<span class="opt-label">' + label + '</span>'
        + '</div>'
      ).join('')
      + '</div>';
  }

  _render() {
    const batteries = this._config.batteries;

    const batteryBlocks = batteries.map((b, i) => {
      return '<div class="battery-box">'
        + '<div class="battery-box-header">'
        + '<span class="battery-box-title">' + this._t('battery') + ' ' + (i + 1) + (b.name ? ' – ' + b.name : '') + '</span>'
        + '<span class="battery-box-actions">'
        + '<button class="icon-btn" data-action="up" data-idx="' + i + '" title="' + this._t('move_up') + '"' + (i === 0 ? ' disabled' : '') + '>▲</button>'
        + '<button class="icon-btn" data-action="down" data-idx="' + i + '" title="' + this._t('move_down') + '"' + (i === batteries.length - 1 ? ' disabled' : '') + '>▼</button>'
        + '<button class="icon-btn danger" data-action="remove" data-idx="' + i + '" title="' + this._t('remove') + '">✕</button>'
        + '</span>'
        + '</div>'
        + '<div class="battery-box-body">'
        + '<ha-form id="battery-form-' + i + '"></ha-form>'
        + this._optionRows(i, b)
        + '</div>'
        + '</div>';
    }).join('');

    this.shadowRoot.innerHTML = '<style>'
      + ':host{display:block}'
      + '.editor{display:flex;flex-direction:column;gap:20px;padding:4px 0}'
      + '.battery-box{border:1px solid var(--divider-color);border-radius:12px;overflow:hidden;background:var(--card-background-color)}'
      + '.battery-box-header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--secondary-background-color);border-bottom:1px solid var(--divider-color)}'
      + '.battery-box-title{font-weight:600;font-size:14px;color:var(--primary-text-color)}'
      + '.battery-box-body{padding:12px}'
      + '.battery-box-actions{display:flex;gap:2px}'
      + '.icon-btn{background:none;border:none;cursor:pointer;color:var(--secondary-text-color);font-size:13px;padding:2px 6px;line-height:1;border-radius:4px}'
      + '.icon-btn:hover:not(:disabled){color:var(--primary-text-color);background:var(--card-background-color)}'
      + '.icon-btn:disabled{opacity:.3;cursor:default}'
      + '.icon-btn.danger:hover{color:var(--error-color,#ef4444)}'
      + '.options{margin-top:14px;display:flex;flex-direction:column;gap:10px}'
      + '.options-title{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--secondary-text-color)}'
      + '.opt-row{display:flex;align-items:center;gap:12px}'
      + '.opt-label{font-size:14px;color:var(--primary-text-color)}'
      + '.add-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;border:1px dashed var(--divider-color);border-radius:12px;background:none;cursor:pointer;color:var(--primary-color);font-size:14px;font-weight:500}'
      + '.add-btn:hover{background:var(--secondary-background-color)}'
      + '</style>'
      + '<div class="editor">'
      + '<ha-form id="title-form"></ha-form>'
      + batteryBlocks
      + '<button class="add-btn" id="add-battery">' + this._t('add_battery') + '</button>'
      + '</div>';

    // Title form
    const titleForm = this.shadowRoot.getElementById('title-form');
    titleForm.hass = this._hass;
    titleForm.schema = [{ name: 'title', label: this._t('card_title'), selector: { text: {} } }];
    titleForm.data = { title: this._config.title || '' };
    titleForm.computeLabel = s => s.label ?? s.name;
    titleForm.addEventListener('value-changed', ev => {
      const v = ev.detail.value?.title || '';
      if (v) this._config.title = v; else delete this._config.title;
      this._fire(false);
    });

    // Battery forms
    batteries.forEach((b, i) => {
      const form = this.shadowRoot.getElementById('battery-form-' + i);
      if (!form) return;
      form.hass = this._hass;
      form.schema = this._batterySchema();
      form.data = this._batteryFormData(b);
      form.computeLabel = s => s.label ?? s.name;
      form.addEventListener('value-changed', ev => {
        this._applyBatteryForm(i, ev.detail.value || {});
      });
    });

    // Display switches
    this.shadowRoot.querySelectorAll('ha-switch[data-option]').forEach(sw => {
      sw.addEventListener('change', () => {
        this._toggleOption(parseInt(sw.dataset.idx, 10), sw.dataset.option, sw.checked);
      });
    });

    // Reorder / remove / add buttons
    this.shadowRoot.querySelectorAll('.icon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (btn.dataset.action === 'up')     this._moveBattery(idx, -1);
        if (btn.dataset.action === 'down')   this._moveBattery(idx, 1);
        if (btn.dataset.action === 'remove') this._removeBattery(idx);
      });
    });
    this.shadowRoot.getElementById('add-battery')?.addEventListener('click', () => this._addBattery());
  }
}

customElements.define('ha-battery-cell-monitoring', BatteryCellMonitoringCard);
customElements.define('ha-battery-cell-monitoring-editor', BatteryCellMonitoringEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-battery-cell-monitoring',
  name: 'Battery Cell Monitoring',
  description: 'Per-cell voltages, spread analysis and warnings for home battery storage.',
  preview: false,
});
