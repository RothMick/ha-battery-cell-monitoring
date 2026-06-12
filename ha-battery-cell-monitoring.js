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
    confirm_reset:    'Really reset the peak spread?',
    confirm_title:    'Confirm reset',
    dismiss_title:    'Delete hint',
    dismiss_confirm:  'Really delete this hint?',
    delete:           'Delete',
    cancel:           'Cancel',
    warn_balancing:   'Perform balancing',
    warn_deactivate:  'Deactivate battery',
    status_settings:  'Status settings',
    standard:         'Default',
    warn_settings:    'Warning hints',
    col_threshold:    'Threshold (mV)',
    col_color:        'Color',
    col_text:         'Text',
    add_entry:        '+ Add entry',
    battery:          'Battery',
    card_title:       'Card title',
    peak_helper:      'Peak helper (input_text)',
    label_name:       'Name',
    label_prefix:     'Entity stem of the cells',
    label_cell_count: 'Number of cells',
    label_digits:     'Digits of the number',
    display:          'Display',
    opt_status:       'Status (badge)',
    opt_chart:        'Bar chart',
    opt_stats:        'Values (min/mean/max/spread)',
    opt_peak:         'Spread peak with reset',
    opt_history:      'History chart',
    hist_minutes:     'Window (minutes)',
    hist_band:        'Band (min-max)',
    hist_line:        'Mean line',
    hist_smooth:      'Smoothed curve',
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
    confirm_reset:    'Peak-Spread wirklich zurücksetzen?',
    confirm_title:    'Reset bestätigen',
    dismiss_title:    'Hinweis löschen',
    dismiss_confirm:  'Hinweis wirklich löschen?',
    delete:           'Löschen',
    cancel:           'Abbrechen',
    warn_balancing:   'Balancing durchführen',
    warn_deactivate:  'Batterie deaktivieren',
    status_settings:  'Status Einstellungen',
    standard:         'Standard',
    warn_settings:    'Warnhinweise',
    col_threshold:    'Schwellwert (mV)',
    col_color:        'Farbe',
    col_text:         'Text',
    add_entry:        '+ Eintrag hinzufügen',
    battery:          'Batterie',
    card_title:       'Titel der Kachel',
    peak_helper:      'Peak-Helfer (input_text)',
    label_name:       'Bezeichnung',
    label_prefix:     'Entity-Stamm der Zellen',
    label_cell_count: 'Anzahl Zellen',
    label_digits:     'Stellen der Nummer',
    display:          'Anzeige',
    opt_status:       'Zustand (Badge)',
    opt_chart:        'Balkendiagramm',
    opt_stats:        'Werte (Min/Mean/Max/Spread)',
    opt_peak:         'Spread-Peak mit Reset',
    opt_history:      'Verlaufskurve',
    hist_minutes:     'Zeitfenster (Minuten)',
    hist_band:        'Fläche (Min-Max)',
    hist_line:        'Mittelwert-Linie',
    hist_smooth:      'Geglättete Kurve',
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
    setTimeout(() => this._refreshHistories(), 0);

  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    if (!old || this._entitiesChanged(old, hass)) this._render();
    if (!old) this._refreshHistories();
  }

  connectedCallback() {
    this._histTimer = setInterval(() => this._refreshHistories(), 60000);
    this._refreshHistories();
  }

  disconnectedCallback() {
    clearInterval(this._histTimer);
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
    const helper = this._peakHelper();
    if (oldHass.states[helper] !== newHass.states[helper]) return true;
    return this._config.batteries.some(b =>
      this._trackedIds(b).some(id => oldHass.states[id] !== newHass.states[id])
    );
  }

  // --- helpers ---

  _batteryKey(battery) {
    return battery.id || battery.entity_prefix || battery.name || 'battery';
  }

  // Status levels: configurable list of {threshold, color, label}.
  // Below the lowest threshold the base status (green/Good) applies.
  _statusLevels() {
    const cfg = this._config.status_levels;
    if (Array.isArray(cfg) && cfg.length) return cfg;
    return [
      { threshold: this._thresholds.watch,    color: '#eab308', label: this._t('status_watch') },
      { threshold: this._thresholds.balance,  color: '#f97316', label: this._t('status_balance') },
      { threshold: this._thresholds.critical, color: '#ef4444', label: this._t('status_critical') },
    ];
  }

  // Warning levels: configurable list of {threshold, color, text}.
  _warnList() {
    const cfg = this._config.warn_levels;
    if (Array.isArray(cfg) && cfg.length) return cfg;
    const legacy = (cfg && typeof cfg === 'object') ? cfg : {};
    return [
      { threshold: legacy.balancing  ?? 100, color: '#f97316', text: this._t('warn_balancing') },
      { threshold: legacy.deactivate ?? 350, color: '#ef4444', text: this._t('warn_deactivate') },
    ];
  }

  // Highest matching level for the given spread, or null.
  _matchLevel(levels, mv) {
    let best = null;
    for (const l of levels) {
      const th = parseFloat(l.threshold);
      if (!isNaN(th) && mv >= th && (best === null || th > parseFloat(best.threshold))) best = l;
    }
    return best;
  }

  _baseColor() {
    return this._config.status_base_color || '#22c55e';
  }

  _spreadColor(mv) {
    const l = this._matchLevel(this._statusLevels(), mv);
    return l ? (l.color || this._baseColor()) : this._baseColor();
  }

  _spreadLabel(mv) {
    const l = this._matchLevel(this._statusLevels(), mv);
    return l ? (l.label || '') : this._t('status_good');
  }

  _peakKey(key)    { return 'bcm_peak_' + key; }
  _dismissKey(key) { return 'bcm_dismiss_' + key; }

  _peakHelper() {
    return this._config.peak_helper || 'input_text.battery_cell_monitoring_peaks';
  }

  // Returns the peak array from the helper, [] when empty/invalid,
  // or null when the helper entity does not exist (-> localStorage fallback).
  _readPeaks() {
    const s = this._hass?.states[this._peakHelper()];
    if (!s) return null;
    try {
      const a = JSON.parse(s.state);
      return Array.isArray(a) ? a : [];
    } catch { return []; }
  }

  // Writes the peaks as a compact array ordered by display position:
  // [{"i":<battery key>,"s":<spread mV>,"t":<timestamp>}, ...]
  _writePeaks(byKey) {
    const arr = this._config.batteries
      .map(b => {
        const k = this._batteryKey(b);
        const e = byKey[k];
        if (!e) return null;
        const entry = { i: k, s: e.s, t: e.t };
        if (e.d) entry.d = 1; // hint dismissed for this peak
        return entry;
      })
      .filter(Boolean);
    this._hass.callService('input_text', 'set_value', {
      entity_id: this._peakHelper(),
      value: JSON.stringify(arr),
    });
  }

  _nowTs() {
    const now = new Date();
    const locale = bcmLang(this._hass) === 'de' ? 'de-DE' : 'en-GB';
    return now.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
         + ' ' + now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  _getPeak(key) {
    const peaks = this._readPeaks();
    if (peaks === null) {
      try {
        const d = JSON.parse(localStorage.getItem(this._peakKey(key)));
        return d || null;
      } catch { return null; }
    }
    const e = peaks.find(p => p.i === key);
    return e ? { spread: e.s, ts: e.t } : null;
  }

  _updatePeak(key, spreadMv) {
    const rounded = Math.round(spreadMv);
    const peaks = this._readPeaks();
    if (peaks === null) {
      const current = this._getPeak(key);
      if (!current || rounded > current.spread) {
        localStorage.setItem(this._peakKey(key), JSON.stringify({ spread: rounded, ts: this._nowTs() }));
      }
      return;
    }
    const current = peaks.find(p => p.i === key);
    if (current && rounded <= current.s) return;
    const byKey = {};
    peaks.forEach(p => { byKey[p.i] = { s: p.s, t: p.t, d: p.d }; });
    byKey[key] = { s: rounded, t: this._nowTs() }; // new peak: dismissed flag cleared
    this._writePeaks(byKey);
  }

  _confirmDialog(title, text, okLabel, onOk) {
    this._dialogOpen = true;
    const ov = document.createElement('div');
    ov.className = 'bcm-overlay';
    ov.innerHTML = '<div class="bcm-dialog">'
      + '<div class="bcm-dialog-title">' + title + '</div>'
      + '<div class="bcm-dialog-text">' + text + '</div>'
      + '<div class="bcm-dialog-actions">'
      + '<button class="bcm-btn" id="bcm-cancel">' + this._t('cancel') + '</button>'
      + '<button class="bcm-btn" id="bcm-ok">' + okLabel + '</button>'
      + '</div></div>';
    const close = () => { this._dialogOpen = false; ov.remove(); this._render(); };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#bcm-cancel').addEventListener('click', close);
    ov.querySelector('#bcm-ok').addEventListener('click', () => { close(); onOk(); });
    this.shadowRoot.appendChild(ov);
  }

  _confirmReset(key) {
    this._confirmDialog(this._t('confirm_title'), this._t('confirm_reset'), this._t('reset_peak'),
      () => this._resetPeak(key));
  }

  _confirmDismiss(key) {
    this._confirmDialog(this._t('dismiss_title'), this._t('dismiss_confirm'), this._t('delete'),
      () => this._dismiss(key));
  }

  _resetPeak(key) {
    // Resetting the peak also clears a dismissed hint, so a newly
    // reached threshold shows the warning banner again.
    localStorage.removeItem(this._dismissKey(key));
    const peaks = this._readPeaks();
    if (peaks === null) {
      localStorage.removeItem(this._peakKey(key));
      this._render();
      return;
    }
    const byKey = {};
    peaks.forEach(p => { if (p.i !== key) byKey[p.i] = { s: p.s, t: p.t, d: p.d }; });
    this._writePeaks(byKey); // re-render follows from the helper state change
  }

  _isDismissed(key, spreadMv) {
    const peaks = this._readPeaks();
    if (peaks !== null) {
      const e = peaks.find(p => p.i === key);
      return !!(e && e.d);
    }
    try {
      const d = JSON.parse(localStorage.getItem(this._dismissKey(key)));
      return d && d.spread >= Math.round(spreadMv);
    } catch { return false; }
  }

  _dismiss(key) {
    const peaks = this._readPeaks();
    if (peaks !== null) {
      const byKey = {};
      peaks.forEach(p => { byKey[p.i] = { s: p.s, t: p.t, d: p.d }; });
      if (!byKey[key]) return; // banner only shows with a recorded peak
      byKey[key].d = 1;
      this._writePeaks(byKey); // re-render follows from the helper state change
      return;
    }
    const battery = this._config.batteries.find(b => this._batteryKey(b) === key);
    if (!battery) return;
    const data = this._data(battery);
    if (!data) return;
    const peak = this._getPeak(key);
    const mv = peak ? peak.spread : Math.round(data.spreadMv);
    localStorage.setItem(this._dismissKey(key), JSON.stringify({ spread: mv }));
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

  // --- history (min/max band + mean line) ---

  async _refreshHistories() {
    if (!this._hass || !this._config || this._histPending) return;
    const wanted = this._config.batteries.filter(b => b.show_history === true);
    if (!wanted.length) return;
    this._histPending = true;
    const minutes = parseFloat(this._config.history_minutes)
      || (parseFloat(this._config.history_hours) || 1) * 60;
    const hours = minutes / 60;
    try {
      for (const b of wanted) {
        try {
          this._histories = this._histories || {};
          this._histories[this._batteryKey(b)] = await this._fetchHistory(b, hours);
        } catch (e) { /* keep previous data on fetch errors */ }
      }
    } finally {
      this._histPending = false;
    }
    this._render();
  }

  // Uses the min/max/mean template sensors when configured; otherwise the
  // cell entities are merged into one timeline and aggregated client-side.
  async _fetchHistory(battery, hours) {
    const useSensors = !!(battery.min && battery.max && battery.mean);
    const ids = useSensors ? [battery.min, battery.max, battery.mean] : this._cellIds(battery);
    if (!ids.length) return null;
    const start = new Date(Date.now() - hours * 3600 * 1000);
    const resp = await this._hass.callWS({
      type: 'history/history_during_period',
      start_time: start.toISOString(),
      entity_ids: ids,
      minimal_response: true,
      no_attributes: true,
    });
    const series = ids.map(id => (resp[id] || [])
      .map(p => ({
        t: typeof p.lu === 'number' ? p.lu * 1000 : Date.parse(p.lu || p.last_updated || p.last_changed),
        v: parseFloat(p.s ?? p.state),
      }))
      .filter(p => !isNaN(p.t) && !isNaN(p.v)));
    const events = [];
    series.forEach((arr, idx) => arr.forEach(p => events.push({ t: p.t, idx, v: p.v })));
    events.sort((a, b) => a.t - b.t);
    const last = new Array(ids.length).fill(null);
    let ready = 0;
    const points = [];
    for (const e of events) {
      if (last[e.idx] === null) ready++;
      last[e.idx] = e.v;
      if (ready < ids.length) continue;
      let mn, mx, mean;
      if (useSensors) {
        mn = last[0]; mx = last[1]; mean = last[2];
      } else {
        mn = Math.min(...last);
        mx = Math.max(...last);
        mean = last.reduce((a, b) => a + b, 0) / last.length;
      }
      points.push({ t: e.t, mn, mx, mean });
    }
    if (points.length) {
      const lastPt = points[points.length - 1];
      points.push({ t: Date.now(), mn: lastPt.mn, mx: lastPt.mx, mean: lastPt.mean });
    }
    return { points, start: start.getTime(), end: Date.now() };
  }

  // Builds an SVG path from [x,y] points; optionally smoothed with
  // Catmull-Rom derived cubic Beziers. lead is 'M' (new path) or 'L'
  // (continue an existing path, used for the back side of the band).
  _histPath(pts, smooth, lead) {
    const f = n => n.toFixed(1);
    if (!smooth || pts.length < 3) {
      return pts.map((p, i) => (i ? 'L' : lead) + f(p[0]) + ',' + f(p[1])).join(' ');
    }
    let d = lead + f(pts[0][0]) + ',' + f(pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + f(c1x) + ',' + f(c1y) + ' ' + f(c2x) + ',' + f(c2y) + ' ' + f(p2[0]) + ',' + f(p2[1]);
    }
    return d;
  }

  // One closed SVG path: forward along the max curve, backward along the
  // min curve - the fill covers exactly the band between both curves.
  _renderHistory(battery) {
    const h = this._histories?.[this._batteryKey(battery)];
    if (!h || !h.points || h.points.length < 2) return '';
    const W = 500, H = 110, padL = 38, padR = 4, padT = 6, padB = 6;
    const pts = h.points;
    let vMin = Infinity, vMax = -Infinity;
    pts.forEach(p => { if (p.mn < vMin) vMin = p.mn; if (p.mx > vMax) vMax = p.mx; });
    const vPad = Math.max((vMax - vMin) * 0.1, 0.002);
    vMin -= vPad; vMax += vPad;
    const x = t => padL + (t - h.start) / (h.end - h.start || 1) * (W - padL - padR);
    const y = v => H - padB - (v - vMin) / (vMax - vMin || 0.001) * (H - padT - padB);
    const smooth = this._config.history_smooth === true;
    const bandHex = /^#[0-9a-fA-F]{6}$/.test(this._config.history_band_color || '') ? this._config.history_band_color : '#3b82f6';
    const lineColor = /^#[0-9a-fA-F]{6}$/.test(this._config.history_line_color || '') ? this._config.history_line_color : 'var(--primary-text-color)';
    const maxPts  = pts.map(p => [x(p.t), y(p.mx)]);
    const minPts  = pts.slice().reverse().map(p => [x(p.t), y(p.mn)]);
    const meanPts = pts.map(p => [x(p.t), y(p.mean)]);
    const band = this._histPath(maxPts, smooth, 'M') + ' ' + this._histPath(minPts, smooth, 'L') + ' Z';
    const meanPath = this._histPath(meanPts, smooth, 'M');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="hist-chart" preserveAspectRatio="none">'
      + '<path d="' + band + '" fill="' + bandHex + '4D" stroke="none"/>'
      + '<path d="' + meanPath + '" fill="none" stroke="' + lineColor + '" stroke-width="1.5"/>'
      + '<text x="2" y="' + (padT + 8) + '" class="hist-lbl">' + vMax.toFixed(3) + '</text>'
      + '<text x="2" y="' + (H - padB) + '" class="hist-lbl">' + vMin.toFixed(3) + '</text>'
      + '</svg>';
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
    const showHistory = battery.show_history === true;
    const showStats  = battery.show_stats  !== false;
    const showPeak   = battery.show_peak   !== false;

    // Peak tracking runs independently of the display options so the
    // badge can always rate the peak, not just the current spread.
    this._updatePeak(key, spreadMv);
    const peak = this._getPeak(key);

    const color = this._spreadColor(spreadMv);
    const peakMv = peak ? peak.spread : Math.round(spreadMv);
    // Warnings rate the peak spread as well - the hint stays visible
    // until the user resets the peak (ideally after balancing).
    const warnLvl = this._matchLevel(this._warnList(), peakMv);
    const showWarn = showStatus && !!warnLvl && !this._isDismissed(key, peakMv);

    // The status badge rates the peak spread (falls back to the current
    // spread until a peak has been recorded).
    const badgeMv = peakMv;
    const badgeColor = this._spreadColor(badgeMv);
    const badgeLabel = this._spreadLabel(badgeMv);
    const badge = showStatus
      ? '<span class="spread-badge" style="color:' + badgeColor + ';border-color:' + badgeColor + ';">' + badgeMv + ' mV – ' + badgeLabel + '</span>'
      : '';

    const warnHtml = showWarn
      ? '<div class="warn-banner" style="border-color:' + warnLvl.color + ';"><span class="warn-icon" style="color:' + warnLvl.color + ';">⚠</span><span class="warn-text" style="color:' + warnLvl.color + ';">' + (warnLvl.text || '') + '</span><button class="warn-dismiss" data-key="' + key + '" title="' + this._t('dismiss') + '">✕</button></div>'
      : '';

    const fmt = v => v.toFixed(3) + ' V';

    let chartHtml = '';
    if (showChart) {
      const cellLabels = cells.map((_, i) => '<span>' + (i + 1) + '</span>').join('');
      chartHtml = this._renderChart(cells, mean) + '<div class="cell-labels">' + cellLabels + '</div>';
    }
    const histHtml = showHistory ? this._renderHistory(battery) : '';

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
      const peakColor = peak ? this._spreadColor(peak.spread) : this._baseColor();
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
      + warnHtml + chartHtml + histHtml + statsHtml + peakHtml
      + '</div>';
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (this._dialogOpen) return; // keep the confirmation dialog alive

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
      + '.hist-chart{width:100%;height:110px;display:block;margin-top:8px}'
      + '.hist-lbl{font-size:9px;fill:var(--secondary-text-color)}'
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
      + '.warn-banner{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;border:1.5px solid;background:none;margin-bottom:10px}'
      + '.warn-icon{font-size:22px;flex-shrink:0}'
      + '.warn-text{flex:1;font-size:16px;font-weight:600}'
      + '.warn-dismiss{background:none;border:none;cursor:pointer;padding:0 2px;color:var(--secondary-text-color);font-size:14px;line-height:1}'
      + '.warn-dismiss:hover{color:var(--primary-text-color)}'
      + '.unavailable{font-size:13px;font-style:italic;color:var(--secondary-text-color)}'
      + '.bcm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:1000}'
      + '.bcm-dialog{background:var(--card-background-color,#1c1c1e);border-radius:14px;padding:20px;max-width:320px;width:80%;box-shadow:0 8px 32px rgba(0,0,0,0.4)}'
      + '.bcm-dialog-title{font-size:17px;font-weight:600;color:var(--primary-text-color);margin-bottom:8px}'
      + '.bcm-dialog-text{font-size:14px;color:var(--primary-text-color);margin-bottom:18px}'
      + '.bcm-dialog-actions{display:flex;justify-content:flex-end;gap:6px}'
      + '.bcm-btn{background:none;border:none;cursor:pointer;padding:8px 14px;border-radius:8px;font-size:14px;font-weight:500;color:var(--primary-color);text-transform:uppercase;letter-spacing:.03em}'
      + '.bcm-btn:hover{background:var(--secondary-background-color)}'
      + '</style>'
      + '<ha-card>'
      + (this._config.title ? '<div class="card-title">' + this._config.title + '</div>' : '')
      + sections
      + '</ha-card>';

    this.shadowRoot.querySelectorAll('.warn-dismiss').forEach(btn => {
      btn.addEventListener('click', () => this._confirmDismiss(btn.dataset.key));
    });
    this.shadowRoot.querySelectorAll('.peak-reset').forEach(btn => {
      btn.addEventListener('click', () => this._confirmReset(btn.dataset.key));
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
    this._pending = false;
    this._open = { status: false, warn: false, hist: false };
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll('ha-form').forEach(f => { f.hass = hass; });
  }

  _t(key) { return bcmT(this._hass, key); }

  // Materialize the level lists in the config so they can be edited.
  _ensureLevels() {
    if (!Array.isArray(this._config.status_levels)) {
      const th = this._config.warn_thresholds || {};
      this._config.status_levels = [
        { threshold: th.watch ?? 20,     color: '#eab308', label: this._t('status_watch') },
        { threshold: th.balance ?? 50,   color: '#f97316', label: this._t('status_balance') },
        { threshold: th.critical ?? 200, color: '#ef4444', label: this._t('status_critical') },
      ];
    }
    if (!Array.isArray(this._config.warn_levels)) {
      const wl = (this._config.warn_levels && typeof this._config.warn_levels === 'object') ? this._config.warn_levels : {};
      this._config.warn_levels = [
        { threshold: wl.balancing ?? 100,  color: '#f97316', text: this._t('warn_balancing') },
        { threshold: wl.deactivate ?? 350, color: '#ef4444', text: this._t('warn_deactivate') },
      ];
    }
  }

  _levelRows(list, listName) {
    return list.map((entry, i) => {
      const hex = /^#[0-9a-fA-F]{6}$/.test(entry.color || '') ? entry.color : '#eab308';
      return '<div class="lvl-row">'
        + '<ha-form id="' + listName + '-lvl-' + i + '"></ha-form>'
        + '<input type="color" class="lvl-color" data-list="' + listName + '" data-idx="' + i + '" value="' + hex + '" title="' + this._t('col_color') + '">'
        + '<button class="icon-btn danger lvl-del" data-list="' + listName + '" data-idx="' + i + '" title="' + this._t('remove') + '">✕</button>'
        + '</div>';
    }).join('');
  }

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
    if (rerender) {
      // Keep the user's scroll position on structural changes (add/move/delete).
      const scroller = this._findScroller();
      const saved = scroller ? scroller.scrollTop : null;
      this._render();
      if (scroller != null && saved != null) {
        requestAnimationFrame(() => { scroller.scrollTop = saved; });
      }
    }
    this._editing = false;
  }

  // Text inputs are buffered: the config is updated locally on every keystroke
  // but config-changed only fires when the field loses focus. This prevents
  // HA's async setConfig round-trip from re-rendering (and stealing focus)
  // while the user is typing.
  _queue() { this._pending = true; }

  _flush() {
    if (!this._pending) return;
    this._pending = false;
    this._fire(false);
  }

  _wireBuffered(form) {
    form.addEventListener('focusout', () => {
      setTimeout(() => {
        if (this._pending && this.shadowRoot.activeElement !== form) this._flush();
      }, 0);
    });
  }

  disconnectedCallback() {
    this._flush();
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
      show_history: false,
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
    this._queue();
  }

  _toggleOption(idx, option, checked) {
    const b = this._config.batteries[idx];
    if (!b) return;
    b[option] = checked;
    this._fire(false);
  }

  _optionRows(i, b) {
    const opts = [
      ['show_status', this._t('opt_status'), true],
      ['show_chart',  this._t('opt_chart'), true],
      ['show_history', this._t('opt_history'), false],
      ['show_stats',  this._t('opt_stats'), true],
      ['show_peak',   this._t('opt_peak'), true],
    ];
    return '<div class="options">'
      + '<div class="options-title">' + this._t('display') + '</div>'
      + opts.map(([key, label, defOn]) =>
        '<div class="opt-row">'
        + '<ha-switch id="opt-' + i + '-' + key + '" data-idx="' + i + '" data-option="' + key + '"' + ((defOn ? b[key] !== false : b[key] === true) ? ' checked' : '') + '></ha-switch>'
        + '<span class="opt-label">' + label + '</span>'
        + '</div>'
      ).join('')
      + '</div>';
  }

  _render() {
    this._ensureLevels();
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
      + '.add-btn.small{padding:6px;font-size:13px}'
      + '.acc{border:1px solid var(--divider-color);border-radius:12px;overflow:hidden;background:var(--card-background-color)}'
      + '.acc summary{cursor:pointer;padding:10px 12px;background:var(--secondary-background-color);font-weight:600;font-size:14px;color:var(--primary-text-color);user-select:none}'
      + '.acc-body{padding:12px;display:flex;flex-direction:column;gap:12px}'
      + '.lvl-row{display:flex;align-items:center;gap:8px;border:1px solid var(--divider-color);border-radius:10px;padding:8px 10px;background:var(--secondary-background-color)}'
      + '.lvl-row ha-form{flex:1}'
      + '.base-label{flex:1;font-size:14px;font-weight:500;color:var(--primary-text-color)}'
      + '.lvl-color{width:34px;height:34px;flex-shrink:0;border:1px solid var(--divider-color);border-radius:8px;padding:2px;background:none;cursor:pointer}'
      + '</style>'
      + '<div class="editor">'
      + '<ha-form id="title-form"></ha-form>'
      + batteryBlocks
      + '<button class="add-btn" id="add-battery">' + this._t('add_battery') + '</button>'
      + '<details class="acc" id="acc-status"' + (this._open.status ? ' open' : '') + '>'
      + '<summary>' + this._t('status_settings') + '</summary>'
      + '<div class="acc-body">'
      + '<div class="lvl-row base">'
      + '<span class="base-label">' + this._t('standard') + '</span>'
      + '<input type="color" class="lvl-color" data-list="base" value="' + (/^#[0-9a-fA-F]{6}$/.test(this._config.status_base_color || '') ? this._config.status_base_color : '#22c55e') + '" title="' + this._t('col_color') + '">'
      + '</div>'
      + this._levelRows(this._config.status_levels, 'status')
      + '<button class="add-btn small" id="add-status">' + this._t('add_entry') + '</button></div>'
      + '</details>'
      + '<details class="acc" id="acc-warn"' + (this._open.warn ? ' open' : '') + '>'
      + '<summary>' + this._t('warn_settings') + '</summary>'
      + '<div class="acc-body">' + this._levelRows(this._config.warn_levels, 'warn')
      + '<button class="add-btn small" id="add-warn">' + this._t('add_entry') + '</button></div>'
      + '</details>'
      + '<details class="acc" id="acc-hist"' + (this._open.hist ? ' open' : '') + '>'
      + '<summary>' + this._t('opt_history') + '</summary>'
      + '<div class="acc-body">'
      + '<ha-form id="hist-form"></ha-form>'
      + '<div class="lvl-row base"><span class="base-label">' + this._t('hist_band') + '</span>'
      + '<input type="color" class="lvl-color" data-list="histband" value="' + (/^#[0-9a-fA-F]{6}$/.test(this._config.history_band_color || '') ? this._config.history_band_color : '#3b82f6') + '" title="' + this._t('col_color') + '"></div>'
      + '<div class="lvl-row base"><span class="base-label">' + this._t('hist_line') + '</span>'
      + '<input type="color" class="lvl-color" data-list="histline" value="' + (/^#[0-9a-fA-F]{6}$/.test(this._config.history_line_color || '') ? this._config.history_line_color : '#ffffff') + '" title="' + this._t('col_color') + '"></div>'
      + '<div class="opt-row"><ha-switch id="hist-smooth"' + (this._config.history_smooth === true ? ' checked' : '') + '></ha-switch>'
      + '<span class="opt-label">' + this._t('hist_smooth') + '</span></div>'
      + '</div>'
      + '</details>'
      + '</div>';

    // Title form
    const titleForm = this.shadowRoot.getElementById('title-form');
    titleForm.hass = this._hass;
    titleForm.schema = [
      { name: 'title', label: this._t('card_title'), selector: { text: {} } },
      { name: 'peak_helper', label: this._t('peak_helper'), selector: { entity: { domain: 'input_text' } } },
    ];
    titleForm.data = {
      title: this._config.title || '',
      peak_helper: this._config.peak_helper || 'input_text.battery_cell_monitoring_peaks',
    };
    titleForm.computeLabel = s => s.label ?? s.name;
    titleForm.addEventListener('value-changed', ev => {
      const v = ev.detail.value || {};
      if (v.title) this._config.title = v.title; else delete this._config.title;
      if (v.peak_helper && v.peak_helper !== 'input_text.battery_cell_monitoring_peaks') {
        this._config.peak_helper = v.peak_helper;
      } else {
        delete this._config.peak_helper;
      }
      this._queue();
    });
    this._wireBuffered(titleForm);

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
      this._wireBuffered(form);
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

    // Level lists (status + warnings)
    [['status', this._config.status_levels, 'label'], ['warn', this._config.warn_levels, 'text']].forEach(([listName, list, textKey]) => {
      list.forEach((entry, i) => {
        const form = this.shadowRoot.getElementById(listName + '-lvl-' + i);
        if (!form) return;
        form.hass = this._hass;
        form.schema = [{ type: 'grid', name: '', schema: [
          { name: 'threshold', label: this._t('col_threshold'), selector: { number: { min: 0, max: 5000, mode: 'box' } } },
          { name: 'text', label: this._t('col_text'), selector: { text: {} } },
        ]}];
        form.data = { threshold: entry.threshold ?? 0, text: entry[textKey] || '' };
        form.computeLabel = s => s.label ?? s.name;
        form.addEventListener('value-changed', ev => {
          const v = ev.detail.value || {};
          entry.threshold = parseFloat(v.threshold) || 0;
          entry[textKey] = v.text || '';
          this._queue();
        });
        this._wireBuffered(form);
      });
    });
    const histForm = this.shadowRoot.getElementById('hist-form');
    if (histForm) {
      histForm.hass = this._hass;
      histForm.schema = [{ name: 'minutes', label: this._t('hist_minutes'), selector: { number: { min: 5, max: 2880, step: 5, mode: 'box' } } }];
      const legacyMin = (parseFloat(this._config.history_hours) || 0) * 60;
      histForm.data = { minutes: this._config.history_minutes ?? (legacyMin || 60) };
      histForm.computeLabel = s => s.label ?? s.name;
      histForm.addEventListener('value-changed', ev => {
        const m = parseFloat(ev.detail.value?.minutes);
        if (m > 0 && m !== 60) this._config.history_minutes = m;
        else delete this._config.history_minutes;
        delete this._config.history_hours; // migrated to minutes
        this._queue();
      });
      this._wireBuffered(histForm);
    }
    this.shadowRoot.getElementById('hist-smooth')?.addEventListener('change', ev => {
      this._config.history_smooth = ev.target.checked;
      this._fire(false);
    });
    this.shadowRoot.querySelectorAll('input.lvl-color').forEach(inp => {
      inp.addEventListener('change', () => {
        if (inp.dataset.list === 'base') {
          this._config.status_base_color = inp.value;
          this._fire(false);
          return;
        }
        if (inp.dataset.list === 'histband') {
          this._config.history_band_color = inp.value;
          this._fire(false);
          return;
        }
        if (inp.dataset.list === 'histline') {
          this._config.history_line_color = inp.value;
          this._fire(false);
          return;
        }
        const list = inp.dataset.list === 'status' ? this._config.status_levels : this._config.warn_levels;
        const entry = list[parseInt(inp.dataset.idx, 10)];
        if (!entry) return;
        entry.color = inp.value;
        this._fire(false);
      });
    });
    this.shadowRoot.getElementById('add-status')?.addEventListener('click', () => {
      this._config.status_levels.push({ threshold: 0, color: '#eab308', label: '' });
      this._fire(true);
    });
    this.shadowRoot.getElementById('add-warn')?.addEventListener('click', () => {
      this._config.warn_levels.push({ threshold: 0, color: '#f97316', text: '' });
      this._fire(true);
    });
    this.shadowRoot.querySelectorAll('.lvl-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const list = btn.dataset.list === 'status' ? this._config.status_levels : this._config.warn_levels;
        list.splice(parseInt(btn.dataset.idx, 10), 1);
        this._fire(true);
      });
    });
    this.shadowRoot.querySelectorAll('details.acc').forEach(d => {
      d.addEventListener('toggle', () => {
        if (d.id === 'acc-status') this._open.status = d.open;
        if (d.id === 'acc-warn') this._open.warn = d.open;
        if (d.id === 'acc-hist') this._open.hist = d.open;
      });
    });
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
