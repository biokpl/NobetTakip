// Nöbet analizi — saf fonksiyonlar. Tarihler 'YYYY-MM-DD', gün numaraları UTC gün sayısı.
import { buildHolidayMap, holidayWindows, nightWindows, iso } from './holidays.js';

export const DOW_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const DOW_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const CATEGORIES = ['Ramazan Bayramı', 'Kurban Bayramı', 'Arife', 'Resmi tatil', 'Kandil gecesi', 'Yılbaşı gecesi'];

export const dn = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
export const fromDn = (n) => { const t = new Date(n * 864e5); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
export const dowOf = (s) => (new Date(dn(s) * 864e5).getUTCDay() + 6) % 7; // 0 = Pazartesi
export const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth() + 1, t.getDate()); };

export function fmtDate(s, withDow = true) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}${withDow ? ' ' + DOW_LONG[dowOf(s)] : ''}`;
}
export function fmtShort(s) {
  const [, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

function categoryOf(h) {
  if (h.type === 'dini') return h.group || 'Dini bayram';
  if (h.type === 'arife') return 'Arife';
  if (h.type === 'resmi' || h.type === 'kurum') return 'Resmi tatil';
  if (h.type === 'kandil') return 'Kandil gecesi';
  if (h.type === 'ozel') return 'Yılbaşı gecesi';
  return 'Diğer';
}

// Tek nöbetin profili: hangi günlere, kaç saat hafta sonu / tatil / özel gece denk geliyor
export function shiftProfile(date, settings, hmap) {
  const [hh, mm] = (settings.startTime || '08:30').split(':').map(Number);
  const start = hh * 60 + mm;
  const end = start + (settings.durationH || 24) * 60;
  const base = dn(date);
  const segments = [];
  let weekendH = 0, holidayH = 0;
  const holidays = new Map(); // isim → saat
  const cats = new Set();
  const nights = [];
  for (let k = 0; k * 1440 < end; k++) {
    const mins = overlap(start, end, k * 1440, (k + 1) * 1440);
    if (!mins) continue;
    const day = fromDn(base + k);
    const dw = dowOf(day);
    const entries = hmap.get(day) || [];
    const local1 = Math.max(start - k * 1440, 0), local2 = Math.min(end - k * 1440, 1440);
    let hol = 0;
    for (const w of holidayWindows(entries)) {
      const o = overlap(local1, local2, w.from, w.to);
      if (o) {
        hol = Math.max(hol, o);
        holidays.set(w.h.name, (holidays.get(w.h.name) || 0) + o / 60);
        cats.add(categoryOf(w.h));
      }
    }
    for (const w of nightWindows(entries)) {
      if (overlap(local1, local2, w.from, w.to)) { nights.push(w.h.name); cats.add(categoryOf(w.h)); }
    }
    const isWk = dw >= 5;
    if (isWk) weekendH += mins / 60;
    holidayH += hol / 60;
    segments.push({ day, dow: dw, hours: mins / 60, weekend: isWk, holidayHours: hol / 60, entries });
  }
  const dow = dowOf(date);
  const tags = [];
  if (dow === 5 || dow === 6) tags.push({ t: 'Hafta sonu', c: 'wk' });
  else if (weekendH > 0) tags.push({ t: 'Hafta sonuna sarkıyor', c: 'wk2' });
  if (dow === 6 && weekendH < 24) tags.push({ t: 'Pazartesiye sarkıyor', c: 'muted' });
  for (const c of cats) tags.push({ t: c, c: c === 'Kandil gecesi' || c === 'Yılbaşı gecesi' ? 'night' : 'hol' });
  return {
    date, dow, weekendH, holidayH, holidays: [...holidays.entries()].map(([name, h]) => ({ name, h })),
    cats: [...cats], nights, segments, tags, isWeekend: dow >= 5, isHoliday: holidayH > 0,
  };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// p-değeri → puan. p ≥ 0,5 tam puan; p = 0,05 ≈ 32; p = 0,01 ≈ 14
const pScore = (p) => Math.round(100 * Math.sqrt(Math.min(1, 2 * p)));
export const scoreLevel = (s) => (s == null ? 'none' : s >= 65 ? 'good' : s >= 40 ? 'mid' : 'bad');

export function analyze(state, now = new Date()) {
  const { settings } = state;
  const shifts = state.shifts.map((s) => s.date).sort();
  const today = todayIso();
  const y0 = Math.min(shifts.length ? Number(shifts[0].slice(0, 4)) : now.getFullYear(), now.getFullYear()) - 1;
  const y1 = Math.max(shifts.length ? Number(shifts[shifts.length - 1].slice(0, 4)) : now.getFullYear(), now.getFullYear()) + 2;
  const hmap = buildHolidayMap(y0, y1, state.customHolidays, state.hiddenHolidays);
  const profiles = shifts.map((d) => ({ ...shiftProfile(d, settings, hmap), note: (state.shifts.find((s) => s.date === d) || {}).note || '' }));
  const n = profiles.length;

  // Aralıklar
  const gaps = [];
  for (let i = 1; i < n; i++) gaps.push({ from: shifts[i - 1], to: shifts[i], days: dn(shifts[i]) - dn(shifts[i - 1]) });
  const gapDays = gaps.map((g) => g.days);
  const gapMean = mean(gapDays), gapStd = std(gapDays);
  gaps.forEach((g) => { g.kind = g.days < settings.shortGap ? 'short' : g.days > settings.longGap ? 'long' : 'normal'; });

  // Gün dağılımı
  const dowCounts = Array(7).fill(0);
  profiles.forEach((p) => dowCounts[p.dow]++);

  // Toplam saatler
  const totalH = n * (settings.durationH || 24);
  const weekendH = profiles.reduce((s, p) => s + p.weekendH, 0);
  const holidayH = profiles.reduce((s, p) => s + p.holidayH, 0);
  const weekendShifts = profiles.filter((p) => p.isWeekend).length;
  const fridayShifts = profiles.filter((p) => p.dow === 4).length;
  const holidayShifts = profiles.filter((p) => p.isHoliday).length;
  const catCounts = Object.fromEntries(CATEGORIES.map((c) => [c, profiles.filter((p) => p.cats.includes(c)).length]));

  // Rastgele dağıtım ile kıyas (Monte Carlo)
  let baseline = null;
  if (n >= 3) {
    const from = settings.periodStart && settings.periodStart < shifts[0] ? settings.periodStart : shifts[0];
    const to = shifts[n - 1];
    const d0 = dn(from), d1 = dn(to);
    const days = [];
    for (let d = d0; d <= d1; d++) days.push(shiftProfile(fromDn(d), settings, hmap));
    const wk = days.map((p) => p.weekendH), hol = days.map((p) => p.holidayH), dw = days.map((p) => p.dow);
    const dowFrac = Array(7).fill(0); dw.forEach((x) => dowFrac[x]++); dowFrac.forEach((_, i) => (dowFrac[i] /= days.length));
    const catFrac = Object.fromEntries(CATEGORIES.map((c) => [c, days.filter((p) => p.cats.includes(c)).length / days.length]));
    const tv = (counts) => counts.reduce((s, c, i) => s + Math.abs(c - n * dowFrac[i]), 0) / (2 * n);
    const obsTV = tv(dowCounts);
    const rand = rng(n * 7919 + d0 * 31 + d1);
    const SIMS = 3000;
    let geWk = 0, geHol = 0, geTV = 0;
    const simWk = [];
    for (let s = 0; s < SIMS; s++) {
      let sw = 0, sh = 0; const cnt = Array(7).fill(0);
      for (let i = 0; i < n; i++) {
        const k = (rand() * days.length) | 0;
        sw += wk[k]; sh += hol[k]; cnt[dw[k]]++;
      }
      simWk.push(sw);
      if (sw >= weekendH - 1e-9) geWk++;
      if (sh >= holidayH - 1e-9) geHol++;
      if (tv(cnt) >= obsTV - 1e-9) geTV++;
    }
    baseline = {
      from, to, days: days.length,
      expWeekendH: mean(wk) * n, expHolidayH: mean(hol) * n,
      expDow: dowFrac.map((f) => f * n),
      expWeekendShifts: days.filter((p) => p.isWeekend).length / days.length * n,
      expHolidayShifts: days.filter((p) => p.isHoliday).length / days.length * n,
      expCat: Object.fromEntries(CATEGORIES.map((c) => [c, catFrac[c] * n])),
      pWeekend: geWk / SIMS, pHoliday: geHol / SIMS, pDow: geTV / SIMS,
      obsTV,
    };
  }

  // Puanlar
  let scores = null;
  if (baseline) {
    const shortCount = gaps.filter((g) => g.kind === 'short').length;
    const cv = gapMean ? gapStd / gapMean : 0;
    const gapScore = Math.round(clamp(100 - 30 * shortCount - Math.max(0, cv - 0.3) * 120, 0, 100));
    const s = {
      dow: pScore(baseline.pDow),
      weekend: pScore(baseline.pWeekend),
      holiday: pScore(baseline.pHoliday),
      gap: gapScore,
    };
    s.total = Math.round(0.2 * s.dow + 0.35 * s.weekend + 0.3 * s.holiday + 0.15 * s.gap);
    scores = s;
  }

  // Şu anki / sonraki nöbet
  const [hh, mm] = (settings.startTime || '08:30').split(':').map(Number);
  const startOf = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, hh, mm); };
  const durMs = (settings.durationH || 24) * 3600e3;
  const current = profiles.find((p) => { const s = startOf(p.date); return now >= s && now < new Date(+s + durMs); }) || null;
  const nextPlanned = profiles.find((p) => startOf(p.date) > now) || null;
  const past = profiles.filter((p) => startOf(p.date) <= now);
  const last = past[past.length - 1] || null;

  let prediction = null;
  if (last && !nextPlanned) {
    const m = n >= 2 ? gapMean : 40;
    const w = Math.max(4, Math.round(n >= 3 ? gapStd : 7));
    const center = dn(last.date) + Math.round(m);
    const lo = center - w, hi = center + w;
    const inWindow = [];
    let wkDays = 0;
    for (let d = lo; d <= hi; d++) {
      const s = fromDn(d);
      if (dowOf(s) >= 5) wkDays++;
      for (const h of hmap.get(s) || []) if (h.type !== 'kandil') inWindow.push({ date: s, ...h });
    }
    prediction = { center: fromDn(center), lo: fromDn(lo), hi: fromDn(hi), avg: m, wkDays, span: hi - lo + 1, holidays: inWindow, profile: shiftProfile(fromDn(center), settings, hmap) };
  }

  // Uyarılar
  const alerts = buildAlerts({ profiles, gaps, settings, baseline, dowCounts, catCounts, prediction, nextPlanned, n });

  // Yıllık özet
  const years = {};
  profiles.forEach((p) => {
    const y = p.date.slice(0, 4);
    years[y] = years[y] || { year: y, count: 0, weekend: 0, holiday: 0, weekendH: 0, holidayH: 0 };
    const Y = years[y];
    Y.count++; if (p.isWeekend) Y.weekend++; if (p.isHoliday) Y.holiday++;
    Y.weekendH += p.weekendH; Y.holidayH += p.holidayH;
  });

  return {
    n, shifts, profiles, gaps, gapMean, gapStd, dowCounts, totalH, weekendH, holidayH,
    weekendShifts, fridayShifts, holidayShifts, catCounts, baseline, scores, current, nextPlanned, last,
    settings, prediction, alerts, years: Object.values(years).sort((a, b) => a.year.localeCompare(b.year)), hmap, today,
  };
}

function pct(p) { return p < 0.01 ? '%1\'den az' : '%' + Math.round(p * 100); }

function buildAlerts({ profiles, gaps, settings, baseline, dowCounts, catCounts, prediction, nextPlanned, n }) {
  const A = [];
  const push = (level, title, text) => A.push({ level, title, text });
  if (n === 0) { push('info', 'Henüz nöbet girilmedi', 'Takvim sekmesinden geçmiş nöbet günlerine dokunarak eklemeye başla. En az 3 nöbetten sonra adalet analizi açılır.'); return A; }
  if (n < 3) push('info', 'Analiz için biraz daha veri', `${n} nöbet girildi. Adalet puanı için en az 3 nöbet gerekiyor; ne kadar çok geçmiş girersen sonuç o kadar güvenilir olur.`);

  if (baseline) {
    const ratio = baseline.expWeekendH ? (profiles.reduce((s, p) => s + p.weekendH, 0) / baseline.expWeekendH) : 0;
    if (baseline.pWeekend < 0.05) push('danger', 'Hafta sonu yükün belirgin şekilde fazla', `Hafta sonu nöbet saatin beklenenin ${ratio.toFixed(1)} katı. Nöbetler rastgele dağıtılsaydı bu kadar hafta sonu denk gelme ihtimali ${pct(baseline.pWeekend)}.`);
    else if (baseline.pWeekend < 0.2) push('warn', 'Hafta sonu yükün ortalamanın üstünde', `Hafta sonu saatin beklenenin ${ratio.toFixed(1)} katı (şans eseri olma ihtimali ${pct(baseline.pWeekend)}). Takipte kal.`);
    const holRatio = baseline.expHolidayH ? profiles.reduce((s, p) => s + p.holidayH, 0) / baseline.expHolidayH : 0;
    if (baseline.pHoliday < 0.05) push('danger', 'Tatillere çok sık denk geliyorsun', `Tatil nöbet saatin beklenenin ${holRatio.toFixed(1)} katı. Rastgele olsa bu kadar denk gelme ihtimali ${pct(baseline.pHoliday)}.`);
    else if (baseline.pHoliday < 0.2) push('warn', 'Tatil nöbetlerin ortalamanın üstünde', `Tatil saatin beklenenin ${holRatio.toFixed(1)} katı (şans eseri olma ihtimali ${pct(baseline.pHoliday)}).`);
    if (baseline.pDow < 0.05) {
      const maxI = dowCounts.indexOf(Math.max(...dowCounts));
      push('warn', 'Nöbetler bazı günlerde yığılıyor', `${DOW_LONG[maxI]} günü ${dowCounts[maxI]} kez (beklenen ≈ ${baseline.expDow[maxI].toFixed(1)}). Gün dağılımı rastgele olmaktan uzak.`);
    }
    for (const c of ['Ramazan Bayramı', 'Kurban Bayramı']) {
      if (catCounts[c] >= 2 && catCounts[c] > baseline.expCat[c] * 3) push('warn', `${c} nöbetleri fazla`, `${c}'na ${catCounts[c]} kez denk geldin, beklenen ≈ ${baseline.expCat[c].toFixed(1)}.`);
    }
  }

  // Aynı gün serisi
  let streak = 1, bestStreak = 1, bestDow = profiles[0]?.dow;
  for (let i = 1; i < n; i++) {
    streak = profiles[i].dow === profiles[i - 1].dow ? streak + 1 : 1;
    if (streak > bestStreak) { bestStreak = streak; bestDow = profiles[i].dow; }
  }
  let tail = 1;
  for (let i = n - 1; i > 0 && profiles[i].dow === profiles[i - 1].dow; i--) tail++;
  if (tail >= 3) push(profiles[n - 1].dow >= 5 ? 'danger' : 'warn', `Son ${tail} nöbetin hepsi ${DOW_LONG[profiles[n - 1].dow]}`, 'Nöbetler hep aynı güne düşüyor. Sıra değişmezse bir sonraki de aynı güne gelecek.');
  else if (bestStreak >= 3) push('info', `Geçmişte ${bestStreak} kez üst üste ${DOW_LONG[bestDow]}`, 'Arka arkaya aynı güne düşen nöbet serisi var.');

  const last3 = gaps.slice(-3);
  if (last3.length >= 2 && last3.every((g) => g.days % 7 === 0)) push('info', 'Aralıklar 7\'nin katı', `Son aralıklar ${last3.map((g) => g.days).join(', ')} gün. 7'nin katı aralıklar nöbetin hep aynı haftanın gününe düşmesine yol açar.`);

  // Üst üste hafta sonu / tatil
  let wkRun = 0, wkBest = 0, holRun = 0, holBest = 0;
  for (const p of profiles) {
    wkRun = p.isWeekend ? wkRun + 1 : 0; wkBest = Math.max(wkBest, wkRun);
    holRun = p.isHoliday ? holRun + 1 : 0; holBest = Math.max(holBest, holRun);
  }
  if (wkRun >= 2) push('danger', `Üst üste ${wkRun} hafta sonu nöbeti`, 'Son nöbetlerin arka arkaya hafta sonuna geldi.');
  else if (wkBest >= 2) push(wkBest >= 3 ? 'warn' : 'info', `Geçmişte ${wkBest} kez üst üste hafta sonu`, 'Arka arkaya hafta sonu nöbeti tuttuğun bir dönem var.');
  if (holBest >= 2) push('danger', `Üst üste ${holBest} tatil nöbeti`, 'Arka arkaya tatil/bayram günlerine denk gelen nöbetlerin var.');

  // Aralıklar
  const shorts = gaps.filter((g) => g.kind === 'short');
  if (shorts.length) {
    const g = shorts[shorts.length - 1];
    push(shorts.length >= 2 ? 'danger' : 'warn', `${shorts.length} kez kısa aralık`, `En son ${fmtShort(g.from)} → ${fmtShort(g.to)} arası sadece ${g.days} gün (eşik ${settings.shortGap} gün).`);
  }
  const longs = gaps.filter((g) => g.kind === 'long');
  if (longs.length) push('info', `${longs.length} uzun aralık`, `En uzun ara ${Math.max(...gaps.map((g) => g.days))} gün.`);

  // Gelecek
  if (nextPlanned) {
    if (nextPlanned.isHoliday) push('warn', 'Sıradaki nöbet tatile denk geliyor', `${fmtDate(nextPlanned.date)}: ${nextPlanned.cats.join(', ')}.`);
    if (nextPlanned.isWeekend && profiles.filter((p) => p.date < nextPlanned.date).slice(-1)[0]?.isWeekend) push('warn', 'Sıradaki nöbet yine hafta sonu', 'Bir önceki nöbetin de hafta sonuydu.');
  } else if (prediction) {
    const big = prediction.holidays.filter((h) => h.type === 'dini' || h.type === 'arife');
    if (big.length) push('warn', 'Tahmini sonraki nöbet aralığında bayram var', `${fmtShort(prediction.lo)} – ${fmtShort(prediction.hi)} aralığında ${[...new Set(big.map((h) => h.group || h.name))].join(', ')}.`);
    else if (prediction.holidays.length) push('info', 'Tahmini aralıkta resmi tatil var', [...new Set(prediction.holidays.map((h) => h.name))].join(', '));
  }

  if (baseline && !A.some((a) => a.level === 'danger' || a.level === 'warn')) push('ok', 'Dağılım dengeli görünüyor', 'Hafta sonu, tatil ve gün dağılımında belirgin bir haksızlık işareti yok.');
  const order = { danger: 0, warn: 1, info: 2, ok: 3 };
  return A.sort((a, b) => order[a.level] - order[b.level]);
}

// Örnek veri: 2024'ten bugüne ~40 günlük, biraz düzensiz nöbetler
export function demoShifts() {
  const out = [];
  let d = dn('2024-01-06');
  const end = dn(todayIso()) + 20;
  const steps = [42, 35, 42, 38, 42, 26, 44, 42, 35, 41, 49, 42, 33, 42, 40, 36, 42, 45, 42, 30, 42, 39];
  let i = 0;
  while (d <= end) { out.push({ date: fromDn(d), note: '' }); d += steps[i++ % steps.length]; }
  return out;
}
