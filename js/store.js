// Nöbet kayıtları ve ayarlar — telefonda localStorage'da tutulur.
const KEY = 'nobetTakip.v1';

const DEFAULTS = {
  shifts: [], // { date: 'YYYY-MM-DD', note: '' }
  settings: {
    startTime: '08:30',
    durationH: 24,
    shortGap: 28,
    longGap: 50,
    periodStart: '',
    theme: 'dark',
  },
  customHolidays: [], // { date, name, type }
  hiddenHolidays: [], // 'date|name'
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...s,
      settings: { ...DEFAULTS.settings, ...(s.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* depolama kapalı olabilir */ }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  hasShift: (date) => state.shifts.some((s) => s.date === date),
  getShift: (date) => state.shifts.find((s) => s.date === date),

  addShift(date, note = '') {
    if (this.hasShift(date)) return;
    state.shifts.push({ date, note });
    state.shifts.sort((a, b) => a.date.localeCompare(b.date));
    save();
  },
  removeShift(date) {
    state.shifts = state.shifts.filter((s) => s.date !== date);
    save();
  },
  setNote(date, note) {
    const s = this.getShift(date);
    if (s) { s.note = note; save(); }
  },

  setSetting(key, value) { state.settings[key] = value; save(); },

  addCustomHoliday(h) { state.customHolidays.push(h); save(); },
  removeCustomHoliday(date, name) {
    state.customHolidays = state.customHolidays.filter((h) => !(h.date === date && h.name === name));
    save();
  },
  toggleHidden(key) {
    const i = state.hiddenHolidays.indexOf(key);
    if (i >= 0) state.hiddenHolidays.splice(i, 1); else state.hiddenHolidays.push(key);
    save();
  },

  exportJSON() {
    return JSON.stringify({ app: 'NobetTakip', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  },
  importJSON(text) {
    const s = JSON.parse(text);
    if (!Array.isArray(s.shifts)) throw new Error('Geçersiz yedek dosyası');
    state = {
      ...structuredClone(DEFAULTS),
      shifts: s.shifts.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((a, b) => a.date.localeCompare(b.date)),
      settings: { ...DEFAULTS.settings, ...(s.settings || {}) },
      customHolidays: s.customHolidays || [],
      hiddenHolidays: s.hiddenHolidays || [],
    };
    save();
  },
  replaceShifts(list) {
    state.shifts = list.slice().sort((a, b) => a.date.localeCompare(b.date));
    save();
  },
  clearAll() {
    state = structuredClone({ ...DEFAULTS, settings: { ...DEFAULTS.settings, theme: state.settings.theme } });
    save();
  },
};
