// Türkiye resmi ve dini tatil tablosu.
// type: resmi | dini (bayram günü) | arife (13:00'ten sonra tatil) | kandil (gece) | ozel (bilgi amaçlı gece)

const FIXED = [
  ['01-01', 'Yılbaşı', 'resmi'],
  ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı', 'resmi'],
  ['05-01', 'Emek ve Dayanışma Günü', 'resmi'],
  ['05-19', 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı', 'resmi'],
  ['07-15', 'Demokrasi ve Millî Birlik Günü', 'resmi'],
  ['08-30', 'Zafer Bayramı', 'resmi'],
  ['10-28', 'Cumhuriyet Bayramı Arifesi', 'arife'],
  ['10-29', 'Cumhuriyet Bayramı', 'resmi'],
  ['12-31', 'Yılbaşı Gecesi', 'ozel'],
];

// Diyanet takvimine göre bayramların ilk günü. 2028 ve sonrası tahmini, Ayarlar'dan düzeltilebilir.
const BAYRAM = {
  2024: { ramazan: '2024-04-10', kurban: '2024-06-16' },
  2025: { ramazan: '2025-03-30', kurban: '2025-06-06' },
  2026: { ramazan: '2026-03-20', kurban: '2026-05-27' },
  2027: { ramazan: '2027-03-09', kurban: '2027-05-16' },
  2028: { ramazan: '2028-02-26', kurban: '2028-05-05', approx: true },
  2029: { ramazan: '2029-02-14', kurban: '2029-04-24', approx: true },
  2030: { ramazan: '2030-02-04', kurban: '2030-04-13', approx: true },
};

// Kandil geceleri (gece, tarihin akşamı). Bilinen yıllar elle, diğerleri Hicri takvimden hesaplanır.
const KANDIL_KNOWN = {
  2024: ['2024-01-11', '2024-02-06', '2024-02-24', '2024-04-05', '2024-09-14'],
  2025: ['2025-01-02', '2025-01-26', '2025-02-13', '2025-03-26', '2025-09-03', '2025-12-25'],
  2026: ['2026-01-15', '2026-02-02', '2026-03-16', '2026-08-24'],
};
const KANDIL_NAMES = {
  regaib: 'Regaib Kandili', mirac: 'Miraç Kandili', berat: 'Berat Kandili',
  kadir: 'Kadir Gecesi', mevlid: 'Mevlid Kandili',
};

export const TYPE_LABEL = {
  resmi: 'Resmi tatil', dini: 'Dini bayram', arife: 'Arife (yarım gün)',
  kandil: 'Kandil gecesi', ozel: 'Özel gece', kurum: 'Kurum tatili',
};

export function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function addDaysIso(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function bayramEntries(year) {
  const b = BAYRAM[year];
  if (!b) return [];
  const out = [];
  const tag = b.approx ? ' (tahmini)' : '';
  out.push({ date: addDaysIso(b.ramazan, -1), name: 'Ramazan Bayramı Arifesi' + tag, type: 'arife', group: 'Ramazan Bayramı' });
  for (let i = 0; i < 3; i++) out.push({ date: addDaysIso(b.ramazan, i), name: `Ramazan Bayramı ${i + 1}. gün` + tag, type: 'dini', group: 'Ramazan Bayramı' });
  out.push({ date: addDaysIso(b.kurban, -1), name: 'Kurban Bayramı Arifesi' + tag, type: 'arife', group: 'Kurban Bayramı' });
  for (let i = 0; i < 4; i++) out.push({ date: addDaysIso(b.kurban, i), name: `Kurban Bayramı ${i + 1}. gün` + tag, type: 'dini', group: 'Kurban Bayramı' });
  return out;
}

// Hicri tarih (Ümmü'l-Kura). Diyanet ile en fazla 1 gün fark edebilir.
let hijriFmt = null;
function hijri(isoDate) {
  try {
    hijriFmt = hijriFmt || new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const p = hijriFmt.formatToParts(new Date(isoDate + 'T12:00:00Z'));
    const g = (t) => Number((p.find((x) => x.type === t) || {}).value);
    return { y: g('year'), m: g('month'), d: g('day') };
  } catch { return null; }
}

function computedKandils(year) {
  const out = [];
  const firstFridayDone = {};
  for (let d = 0; d < 366; d++) {
    const s = addDaysIso(iso(year, 1, 1), d);
    if (!s.startsWith(String(year))) break;
    const h = hijri(s);
    if (!h) return [];
    const next = hijri(addDaysIso(s, 1));
    const dow = new Date(s + 'T12:00:00Z').getUTCDay();
    // Regaib: Recep ayının ilk Cuma gecesi (Perşembe akşamı)
    if (next.m === 7 && next.d <= 7 && dow === 4 && !firstFridayDone[next.y]) {
      firstFridayDone[next.y] = true; out.push({ date: s, name: KANDIL_NAMES.regaib });
    }
    if (next.m === 7 && next.d === 27) out.push({ date: s, name: KANDIL_NAMES.mirac });
    if (next.m === 8 && next.d === 15) out.push({ date: s, name: KANDIL_NAMES.berat });
    if (next.m === 9 && next.d === 27) out.push({ date: s, name: KANDIL_NAMES.kadir });
    if (next.m === 3 && next.d === 12) out.push({ date: s, name: KANDIL_NAMES.mevlid });
  }
  return out.map((k) => ({ ...k, type: 'kandil', name: k.name + ' (hesaplanan)' }));
}

function knownKandils(year) {
  const list = KANDIL_KNOWN[year];
  if (!list) return null;
  return list.map((date) => {
    // isim için hicri aya bak
    const n = hijri(addDaysIso(date, 1));
    let name = 'Kandil';
    if (n) {
      if (n.m === 7 && n.d <= 7) name = KANDIL_NAMES.regaib;
      else if (n.m === 7) name = KANDIL_NAMES.mirac;
      else if (n.m === 8) name = KANDIL_NAMES.berat;
      else if (n.m === 9) name = KANDIL_NAMES.kadir;
      else if (n.m === 3) name = KANDIL_NAMES.mevlid;
    }
    return { date, name, type: 'kandil' };
  });
}

const cache = new Map();
export function holidaysOfYear(year) {
  if (cache.has(year)) return cache.get(year);
  const list = [];
  for (const [md, name, type] of FIXED) list.push({ date: `${year}-${md}`, name, type });
  list.push(...bayramEntries(year));
  const kk = knownKandils(year);
  const comp = computedKandils(year);
  if (kk) {
    // bilinen listede olmayan kandilleri (ör. yıl sonu Regaib) hesaplanandan tamamla
    const near = (a, b) => Math.abs(new Date(a) - new Date(b)) <= 3 * 864e5;
    list.push(...kk, ...comp.filter((c) => !kk.some((k) => near(k.date, c.date))));
  } else list.push(...comp);
  const res = list.filter((h) => h.date.startsWith(String(year)));
  cache.set(year, res);
  return res;
}

// Kullanıcı eklemeleri / gizlemeleriyle birlikte tarih → tatil listesi haritası
export function buildHolidayMap(fromYear, toYear, custom = [], hidden = []) {
  const map = new Map();
  const hiddenSet = new Set(hidden);
  const add = (h) => {
    if (hiddenSet.has(h.date + '|' + h.name)) return;
    if (!map.has(h.date)) map.set(h.date, []);
    map.get(h.date).push(h);
  };
  for (let y = fromYear; y <= toYear; y++) {
    holidaysOfYear(y).forEach(add);
  }
  custom.forEach((h) => add({ ...h, custom: true }));
  return map;
}

// Bir günün tatil saat aralıkları (dakika olarak, gün içi). Kandil/özel geceler sayılmaz.
export function holidayWindows(entries) {
  const out = [];
  for (const h of entries || []) {
    if (h.type === 'resmi' || h.type === 'dini' || h.type === 'kurum') out.push({ from: 0, to: 1440, h });
    else if (h.type === 'arife') out.push({ from: 780, to: 1440, h });
  }
  return out;
}
export function nightWindows(entries) {
  return (entries || []).filter((h) => h.type === 'kandil' || h.type === 'ozel').map((h) => ({ from: 1200, to: 1440, h }));
}
