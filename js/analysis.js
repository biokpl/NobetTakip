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
  else if (dow === 4) tags.push({ t: 'Cuma · hafta sonuna sarkıyor', c: 'wk' });
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

export const HARD = new Set([4, 5, 6]); // Cuma, Cumartesi, Pazar — en zor günler
export const yearOf = (opts, now = new Date()) => (!opts || opts.year == null || opts.year === 'current' ? String(now.getFullYear()) : opts.year === 'all' ? null : String(opts.year));

// Kayıtları seçilen temele göre tarihle: 'assigned' = kurumun yazdığı tarih, 'worked' = fiilen tutulan tarih
export function shiftEntries(state, basis = 'assigned') {
  return state.shifts
    .map((s) => ({ date: basis === 'assigned' ? (s.assigned || s.date) : s.date, worked: s.date, assigned: s.assigned || s.date, swapped: !!s.assigned && s.assigned !== s.date, note: s.note || '' }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function withMeta(p, e, basis) {
  const tags = p.tags.slice();
  if (e.swapped) tags.unshift({ t: basis === 'assigned' ? `Değişim → ${fmtShort(e.worked)} tutuldu` : `Değişim (Asıl ${Number(e.assigned.slice(8))} ${MONTHS[Number(e.assigned.slice(5, 7)) - 1]} - ${DOW_LONG[dowOf(e.assigned)]})`, c: 'swap' });
  return { ...p, tags, worked: e.worked, assigned: e.assigned, swapped: e.swapped, note: e.note, isHard: HARD.has(p.dow) };
}

// Gün kuralı: her gün yılda tam 1 kez
export function ruleOfYear(year, profiles, now = new Date()) {
  const counts = Array(7).fill(0);
  const dates = Array.from({ length: 7 }, () => []);
  profiles.filter((p) => p.date.startsWith(year)).forEach((p) => { counts[p.dow]++; dates[p.dow].push(p.date); });
  const complete = Number(year) < now.getFullYear();
  return {
    year, counts, dates, complete, total: counts.reduce((a, b) => a + b, 0),
    doubles: counts.map((c, i) => (c >= 2 ? i : null)).filter((x) => x != null),
    missing: counts.map((c, i) => (c === 0 ? i : null)).filter((x) => x != null),
  };
}

export function analyze(state, opts = {}, now = new Date()) {
  const { settings } = state;
  const year = yearOf(opts, now);
  const today = todayIso();
  // Her hesap fiilen tutulan güne göre (değişimde tuttuğun gün sayılır)
  const entries = shiftEntries(state, 'worked');
  const assignedDays = entries.map((e) => ({ date: e.date, dow: dowOf(e.date) }));
  const yrs = entries.map((e) => Number(e.date.slice(0, 4))).concat(state.shifts.map((s) => Number(s.date.slice(0, 4))));
  const y0 = Math.min(...yrs, now.getFullYear()) - 1;
  const y1 = Math.max(...yrs, now.getFullYear()) + 2;
  const hmap = buildHolidayMap(y0, y1, state.customHolidays, state.hiddenHolidays);
  const allProfiles = entries.map((e) => withMeta(shiftProfile(e.date, settings, hmap), e, 'worked'));
  const profiles = year ? allProfiles.filter((p) => p.date.startsWith(year)) : allProfiles;
  const shifts = profiles.map((p) => p.date);
  const n = profiles.length;

  // Aralıklar (yılın ilk nöbeti önceki yılın son nöbetiyle kıyaslanır)
  const allGaps = [];
  for (let i = 1; i < allProfiles.length; i++) {
    const a = allProfiles[i - 1].date, b = allProfiles[i].date;
    allGaps.push({ from: a, to: b, days: dn(b) - dn(a) });
  }
  allGaps.forEach((g) => { g.kind = g.days < settings.shortGap ? 'short' : g.days > settings.longGap ? 'long' : 'normal'; });
  const gaps = year ? allGaps.filter((g) => g.to.startsWith(year)) : allGaps;
  const gapDays = gaps.map((g) => g.days);
  const gapMean = mean(gapDays), gapStd = std(gapDays);
  const allGapDays = allGaps.map((g) => g.days);

  const dowCounts = Array(7).fill(0);
  profiles.forEach((p) => dowCounts[p.dow]++);

  const totalH = n * (settings.durationH || 24);
  const weekendH = profiles.reduce((s, p) => s + p.weekendH, 0);
  const holidayH = profiles.reduce((s, p) => s + p.holidayH, 0);
  const weekendShifts = profiles.filter((p) => p.isWeekend).length;
  const hardShifts = profiles.filter((p) => p.isHard).length;
  const holidayShifts = profiles.filter((p) => p.isHoliday).length;
  const swaps = profiles.filter((p) => p.swapped).length;
  const catCounts = Object.fromEntries(CATEGORIES.map((c) => [c, profiles.filter((p) => p.cats.includes(c)).length]));

  // Gün kuralı
  const availableYears = [...new Set(allProfiles.concat(assignedDays).map((p) => p.date.slice(0, 4)).concat(String(now.getFullYear())))].sort();
  const ruleYears = availableYears.map((y) => ruleOfYear(y, assignedDays, now));
  const rule = ruleYears.find((r) => r.year === (year || String(now.getFullYear())));

  // Rastgele dağıtım ile kıyas (Monte Carlo)
  let baseline = null;
  if (n >= 3) {
    let from, to;
    if (year) {
      const ps = settings.periodStart;
      from = ps && ps.startsWith(year) ? ps : `${year}-01-01`;
      const end = `${year}-12-31`;
      to = year === String(now.getFullYear()) && today > shifts[n - 1] ? today : shifts[n - 1];
      if (to > end) to = end;
    } else {
      from = settings.periodStart && settings.periodStart < shifts[0] ? settings.periodStart : shifts[0];
      to = shifts[n - 1];
    }
    const d0 = dn(from), d1 = dn(to);
    const days = [];
    for (let d = d0; d <= d1; d++) days.push(shiftProfile(fromDn(d), settings, hmap));
    const hard = days.map((p) => (HARD.has(p.dow) ? 1 : 0)), hol = days.map((p) => p.holidayH), dw = days.map((p) => p.dow);
    const dowFrac = Array(7).fill(0); dw.forEach((x) => dowFrac[x]++); dowFrac.forEach((_, i) => (dowFrac[i] /= days.length));
    const catFrac = Object.fromEntries(CATEGORIES.map((c) => [c, days.filter((p) => p.cats.includes(c)).length / days.length]));
    const rand = rng(n * 7919 + d0 * 31 + d1);
    const SIMS = 3000;
    let geHard = 0, geHol = 0;
    for (let s = 0; s < SIMS; s++) {
      let sh = 0, sl = 0;
      for (let i = 0; i < n; i++) { const k = (rand() * days.length) | 0; sh += hard[k]; sl += hol[k]; }
      if (sh >= hardShifts) geHard++;
      if (sl >= holidayH - 1e-9) geHol++;
    }
    baseline = {
      from, to, days: days.length,
      expHard: mean(hard) * n, expHolidayH: mean(hol) * n,
      expWeekendH: mean(days.map((p) => p.weekendH)) * n,
      expDow: dowFrac.map((f) => f * n),
      expHolidayShifts: days.filter((p) => p.isHoliday).length / days.length * n,
      expCat: Object.fromEntries(CATEGORIES.map((c) => [c, catFrac[c] * n])),
      pHard: geHard / SIMS, pHoliday: geHol / SIMS,
    };
  }

  // Puanlar
  const ruleScoreOf = (r) => clamp(100 - r.counts.reduce((s, c, i) => s + Math.max(0, c - 1) * (HARD.has(i) ? 40 : 25), 0) - (r.complete ? r.missing.length * 10 : 0), 0, 100);
  let scores = null;
  if (baseline) {
    const shortCount = gaps.filter((g) => g.kind === 'short').length;
    const cv = gapMean ? gapStd / gapMean : 0;
    const relevant = year ? [rule] : ruleYears.filter((r) => r.total > 0);
    const s = {
      hard: pScore(baseline.pHard),
      holiday: pScore(baseline.pHoliday),
      rule: Math.round(mean(relevant.map(ruleScoreOf))),
      gap: Math.round(clamp(100 - 30 * shortCount - Math.max(0, cv - 0.3) * 120, 0, 100)),
    };
    s.total = Math.round(0.3 * s.hard + 0.25 * s.holiday + 0.3 * s.rule + 0.15 * s.gap);
    // Kural ihlali varsa toplam puan "adil" görünemez: Cuma–Pazar ihlalinde en fazla 50, diğerlerinde 64
    const dbl = relevant.flatMap((r) => r.doubles);
    if (dbl.some((i) => HARD.has(i))) s.total = Math.min(s.total, 50);
    else if (dbl.length) s.total = Math.min(s.total, 64);
    scores = s;
  }

  // Şu anki / sonraki nöbet: her zaman fiilen tutulan tarihlere göre
  const [hh, mm] = (settings.startTime || '08:30').split(':').map(Number);
  const startOf = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, hh, mm); };
  const durMs = (settings.durationH || 24) * 3600e3;
  const worked = shiftEntries(state, 'worked').map((e) => withMeta(shiftProfile(e.date, settings, hmap), e, 'worked'));
  const current = worked.find((p) => { const s = startOf(p.date); return now >= s && now < new Date(+s + durMs); }) || null;
  const nextPlanned = worked.find((p) => startOf(p.date) > now) || null;
  const past = worked.filter((p) => startOf(p.date) <= now);
  const last = past[past.length - 1] || null;

  let prediction = null;
  if (last && !nextPlanned) {
    const m = allGapDays.length ? mean(allGapDays) : 50;
    const w = Math.max(5, Math.round(allGapDays.length >= 3 ? std(allGapDays) : 10));
    const center = dn(last.date) + Math.round(m);
    const lo = center - w, hi = center + w;
    const inWindow = [];
    let hardDays = 0;
    const remaining = {};
    const candidates = [];
    for (let d = lo; d <= hi; d++) {
      const s = fromDn(d);
      const y = s.slice(0, 4);
      remaining[y] = remaining[y] || ruleOfYear(y, assignedDays, now).missing;
      if (HARD.has(dowOf(s))) hardDays++;
      for (const h of hmap.get(s) || []) if (h.type !== 'kandil') inWindow.push({ date: s, ...h });
      if (remaining[y].includes(dowOf(s))) candidates.push(s);
    }
    prediction = { center: fromDn(center), lo: fromDn(lo), hi: fromDn(hi), avg: m, hardDays, span: hi - lo + 1, holidays: inWindow, candidates, profile: shiftProfile(fromDn(center), settings, hmap) };
  }

  const alerts = buildAlerts({ profiles, gaps, settings, baseline, catCounts, prediction, nextPlanned, n, year, rule, ruleYears, hardShifts, holidayShifts });

  const years = ruleYears.filter((r) => r.total > 0).map((r) => {
    const ps = allProfiles.filter((p) => p.date.startsWith(r.year));
    return {
      year: r.year, count: ps.length, hard: ps.filter((p) => p.isHard).length, weekend: ps.filter((p) => p.isWeekend).length,
      holiday: ps.filter((p) => p.isHoliday).length, weekendH: ps.reduce((s, p) => s + p.weekendH, 0), holidayH: ps.reduce((s, p) => s + p.holidayH, 0),
      swaps: ps.filter((p) => p.swapped).length, doubles: r.doubles.length,
    };
  });

  return {
    n, year, shifts, profiles, allProfiles, gaps, gapMean, gapStd, dowCounts, totalH, weekendH, holidayH,
    weekendShifts, hardShifts, holidayShifts, swaps, catCounts, baseline, scores, current, nextPlanned, last, rule, ruleYears,
    settings, prediction, alerts, years, hmap, today, availableYears,
  };
}

function pct(p) { return p < 0.01 ? '%1\'den az' : '%' + Math.round(p * 100); }
const dowList = (arr) => arr.map((i) => DOW_LONG[i]).join(', ');

function buildAlerts({ profiles, gaps, settings, baseline, catCounts, prediction, nextPlanned, n, year, rule, ruleYears, hardShifts, holidayShifts }) {
  const A = [];
  const push = (level, title, text) => A.push({ level, title, text });
  if (!ruleYears.some((r) => r.total)) { push('info', 'Henüz nöbet girilmedi', 'Takvim sekmesinden geçmiş nöbet günlerine dokunarak eklemeye başla. En az 3 nöbetten sonra adalet puanı açılır.'); return A; }
  if (n < 3) push('info', year ? `${year} için puan henüz yok` : 'Analiz için biraz daha veri', `${n} nöbet var. Puan için en az 3 nöbet gerekiyor${year ? '; üstten "Tümü"nü seçerek bütün yılları birlikte görebilirsin' : ''}.`);

  // Gün kuralı
  const checkYears = year ? [rule] : ruleYears.filter((r) => r.total > 0);
  for (const r of checkYears) {
    for (const i of r.doubles) {
      const hard = HARD.has(i);
      push(hard ? 'danger' : 'warn', `Kural ihlali: ${r.year}'de ${DOW_LONG[i]} ${r.counts[i]}. kez`,
        `Kurala göre her gün yılda 1 kez gelmeli. ${DOW_LONG[i]} günü tuttuğun nöbetler: ${r.dates[i].map(fmtShort).join(', ')}.${hard ? ' Cuma–Pazar en zor günlerden.' : ''}`);
    }
    if (r.complete && r.missing.length && r.total) push('info', `${r.year}'de hiç gelmeyen gün: ${dowList(r.missing)}`, 'Yıl tamamlanmış; bu günlere hiç nöbet yazılmamış.');
  }
  if (rule && !rule.complete && rule.total && rule.missing.length) {
    push('info', `${rule.year}'de kalan günler: ${rule.missing.map((i) => DOW_SHORT[i]).join(', ')}`, `Kural işliyorsa bu yılki sonraki nöbetin bu günlerden birine gelmeli.${rule.missing.some((i) => HARD.has(i)) ? ' Kalanlar arasında Cuma–Pazar günü var.' : ''}`);
  }

  if (baseline) {
    const ratio = baseline.expHard ? hardShifts / baseline.expHard : 0;
    if (baseline.pHard < 0.05) push('danger', 'Cuma–Pazar yükün belirgin şekilde fazla', `${hardShifts} nöbetin Cuma–Pazar'a geldi, beklenen ≈ ${baseline.expHard.toFixed(1)} (${ratio.toFixed(1)} kat). Rastgele olsa bu kadar denk gelme ihtimali ${pct(baseline.pHard)}.`);
    else if (baseline.pHard < 0.2) push('warn', 'Cuma–Pazar yükün ortalamanın üstünde', `${hardShifts} nöbet Cuma–Pazar, beklenen ≈ ${baseline.expHard.toFixed(1)} (şans eseri olma ihtimali ${pct(baseline.pHard)}).`);
    const holRatio = baseline.expHolidayH ? profiles.reduce((s, p) => s + p.holidayH, 0) / baseline.expHolidayH : 0;
    if (baseline.pHoliday < 0.05) push('danger', 'Tatillere çok sık denk geliyorsun', `Tatil nöbet saatin beklenenin ${holRatio.toFixed(1)} katı. Rastgele olsa bu kadar denk gelme ihtimali ${pct(baseline.pHoliday)}.`);
    else if (baseline.pHoliday < 0.2) push('warn', 'Tatil nöbetlerin ortalamanın üstünde', `Tatil saatin beklenenin ${holRatio.toFixed(1)} katı (şans eseri olma ihtimali ${pct(baseline.pHoliday)}).`);
    for (const c of ['Ramazan Bayramı', 'Kurban Bayramı']) {
      if (catCounts[c] >= 2 && catCounts[c] > baseline.expCat[c] * 3) push('warn', `${c} nöbetleri fazla`, `${c}'na ${catCounts[c]} kez denk geldin, beklenen ≈ ${baseline.expCat[c].toFixed(1)}.`);
    }
  }
  if (year && holidayShifts >= 2) push('warn', `${year}'de ${holidayShifts} tatil nöbeti`, `Bu yıl tatile denk gelen nöbetler: ${profiles.filter((p) => p.isHoliday).map((p) => fmtShort(p.date)).join(', ')}.`);
  for (const c of ['Ramazan Bayramı', 'Kurban Bayramı']) {
    const ys = [...new Set(profiles.filter((p) => p.cats.includes(c)).map((p) => Number(p.date.slice(0, 4))))].sort();
    for (let i = 1; i < ys.length; i++) if (ys[i] === ys[i - 1] + 1) push('danger', `${c} üst üste iki yıl`, `${ys[i - 1]} ve ${ys[i]} yıllarında ${c}'na nöbet yazılmış.`);
  }

  // Üst üste Cuma–Pazar / tatil
  let hRun = 0, hBest = 0, holRun = 0, holBest = 0;
  for (const p of profiles) {
    hRun = p.isHard ? hRun + 1 : 0; hBest = Math.max(hBest, hRun);
    holRun = p.isHoliday ? holRun + 1 : 0; holBest = Math.max(holBest, holRun);
  }
  if (hRun >= 2) push('danger', `Üst üste ${hRun} Cuma–Pazar nöbeti`, 'Son nöbetlerin arka arkaya en zor günlere geldi.');
  else if (hBest >= 3) push('warn', `${hBest} kez üst üste Cuma–Pazar`, 'Arka arkaya zor güne gelen nöbet serisi var.');
  if (holBest >= 2) push('danger', `Üst üste ${holBest} tatil nöbeti`, 'Arka arkaya tatil/bayram günlerine denk gelen nöbetlerin var.');

  // Aralıklar
  const shorts = gaps.filter((g) => g.kind === 'short');
  if (shorts.length) {
    const g = shorts[shorts.length - 1];
    push(shorts.length >= 2 ? 'danger' : 'warn', `${shorts.length} kez kısa aralık`, `En son ${fmtShort(g.from)} → ${fmtShort(g.to)} arası sadece ${g.days} gün (eşik ${settings.shortGap} gün).`);
  }
  const longs = gaps.filter((g) => g.kind === 'long');
  if (longs.length) push('info', `${longs.length} uzun aralık`, `En uzun ara ${Math.max(...gaps.map((g) => g.days))} gün (eşik ${settings.longGap} gün).`);

  // Gelecek
  if (nextPlanned) {
    if (nextPlanned.isHoliday) push('warn', 'Sıradaki nöbet tatile denk geliyor', `${fmtDate(nextPlanned.date)}: ${nextPlanned.cats.join(', ')}.`);
  } else if (prediction) {
    const big = prediction.holidays.filter((h) => h.type === 'dini' || h.type === 'arife');
    if (big.length) push('warn', 'Tahmini sonraki nöbet aralığında bayram var', `${fmtShort(prediction.lo)} – ${fmtShort(prediction.hi)} aralığında ${[...new Set(big.map((h) => h.group || h.name))].join(', ')}.`);
    else if (prediction.holidays.length) push('info', 'Tahmini aralıkta resmi tatil var', [...new Set(prediction.holidays.map((h) => h.name))].join(', '));
  }

  if (baseline && !A.some((a) => a.level === 'danger' || a.level === 'warn')) push('ok', 'Dağılım dengeli görünüyor', 'Gün kuralı, Cuma–Pazar ve tatil dağılımında haksızlık işareti yok.');
  const order = { danger: 0, warn: 1, info: 2, ok: 3 };
  return A.sort((a, b) => order[a.level] - order[b.level]);
}

// Örnek veri: 2024'ten bugüne ~1,5–2 aylık nöbetler, biri değişimli
export function demoShifts() {
  const out = [];
  let d = dn('2024-01-09');
  const end = dn(todayIso()) + 25;
  const steps = [52, 47, 55, 50, 58, 45, 52, 61, 49, 53, 44, 56, 51, 48, 57, 52, 46, 54, 50];
  let i = 0;
  while (d <= end) { out.push({ date: fromDn(d), note: '' }); d += steps[i++ % steps.length]; }
  if (out.length > 4) { const k = out.length - 3; out[k] = { date: fromDn(dn(out[k].date) + 9), assigned: out[k].date, note: 'Değişim yapıldı' }; }
  return out;
}
