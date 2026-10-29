import { store } from '../store.js';
import { analyze, shiftProfile, DOW_SHORT, MONTHS, fmtDate, dn, fromDn, dowOf, todayIso } from '../analysis.js';
import { iso, TYPE_LABEL, addDaysIso } from '../holidays.js';
import { icon, esc, openSheet, closeSheet, toast } from '../ui.js';
import { tagHtml } from './panel.js';

let ym = null; // [yıl, ay(0-11)]

const TYPE_COLOR = { resmi: 'var(--hol)', dini: 'var(--bayram)', arife: 'var(--bayram)', kandil: 'var(--night)', ozel: 'var(--night)', kurum: 'var(--hol)' };

export function renderCalendar(root, a) {
  if (!ym) { const t = new Date(); ym = [t.getFullYear(), t.getMonth()]; }
  const [Y, M] = ym;
  const shiftSet = new Set(a.shifts);
  const today = todayIso();
  const first = iso(Y, M + 1, 1);
  const startDn = dn(first) - dowOf(first);

  let cells = '';
  let mShifts = 0, mWk = 0, mHol = 0;
  for (let i = 0; i < 42; i++) {
    const d = fromDn(startDn + i);
    const inMonth = Number(d.slice(5, 7)) === M + 1;
    if (i >= 35 && !inMonth && i % 7 === 0) break;
    const dw = dowOf(d);
    const ents = a.hmap.get(d) || [];
    const cls = ['day'];
    if (!inMonth) cls.push('out');
    if (dw >= 5) cls.push('we');
    if (ents.some((h) => h.type === 'dini')) cls.push('bayram');
    else if (ents.some((h) => h.type === 'arife')) cls.push('arife');
    else if (ents.some((h) => h.type === 'resmi' || h.type === 'kurum')) cls.push('holiday');
    if (d === today) cls.push('today');
    const isShift = shiftSet.has(d);
    if (isShift) cls.push('shift');
    else if (shiftSet.has(addDaysIso(d, -1))) cls.push('spill');
    if (inMonth) {
      if (isShift) mShifts++;
      if (dw >= 5) mWk++;
      if (ents.some((h) => ['resmi', 'dini', 'kurum'].includes(h.type))) mHol++;
    }
    const dots = [...new Set(ents.map((h) => TYPE_COLOR[h.type]))].slice(0, 3).map((col) => `<i style="background:${col}"></i>`).join('');
    cells += `<button class="${cls.join(' ')}" data-d="${d}" aria-label="${fmtDate(d)}"><span class="num">${Number(d.slice(8))}</span>${dots ? `<span class="dots">${dots}</span>` : ''}</button>`;
  }

  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <div class="cal-head">
      <button class="icon-btn" id="prev" aria-label="Önceki ay">${icon('left')}</button>
      <h2>${MONTHS[M]} <span>${Y}</span></h2>
      <button class="icon-btn" id="todayBtn" aria-label="Bugüne git" style="width:auto;padding:0 12px;font-size:12.5px;font-weight:800">Bugün</button>
      <button class="icon-btn" id="next" aria-label="Sonraki ay">${icon('right')}</button>
    </div>
    <div class="cal-grid">${DOW_SHORT.map((d, i) => `<div class="cal-dow ${i >= 5 ? 'we' : ''}">${d}</div>`).join('')}${cells}</div>
    <div class="legend">
      <span><i style="background:linear-gradient(135deg,var(--accent),var(--accent2))"></i>Nöbet</span>
      <span><i style="background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 55%,transparent),transparent 70%)"></i>Sabaha sarkan</span>
      <span><i style="background:color-mix(in srgb,var(--wk) 30%,transparent)"></i>Hafta sonu</span>
      <span><i style="background:var(--bayram)"></i>Bayram/arife</span>
      <span><i style="background:var(--hol)"></i>Resmi tatil</span>
      <span><i style="background:var(--night);border-radius:50%"></i>Kandil gecesi</span>
    </div>
    <div class="month-stats">
      <div><b>${mShifts}</b><span>bu ay nöbet</span></div>
      <div><b>${mWk}</b><span>hafta sonu günü</span></div>
      <div><b>${mHol}</b><span>tatil günü</span></div>
    </div>`;
  root.append(card);

  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.style.cssText = 'text-align:center;margin:4px 0 14px';
  tip.textContent = 'Bir güne dokun: nöbet ekle, sil ya da o günün detayını gör. Ay değiştirmek için sağa-sola kaydır.';
  root.append(tip);

  // Bu aydaki tatiller listesi
  const monthHol = [];
  for (let d = 1; d <= 31; d++) {
    const s = iso(Y, M + 1, d);
    if (Number(s.slice(5, 7)) !== M + 1 || !a.hmap.has(s)) continue;
    if (fromDn(dn(s)) !== s) continue;
    a.hmap.get(s).forEach((h) => monthHol.push({ ...h, date: s }));
  }
  if (monthHol.length) {
    const hc = document.createElement('section');
    hc.className = 'card';
    hc.innerHTML = `<h2>Bu ayın özel günleri</h2><div class="hol-list">${monthHol.map((h) => `<div class="hol-item"><i style="background:${TYPE_COLOR[h.type]}"></i>
      <span style="flex:1">${esc(h.name)}</span><span class="muted" style="font-size:12px">${Number(h.date.slice(8))} ${MONTHS[M].slice(0, 3)} ${DOW_SHORT[dowOf(h.date)]}</span></div>`).join('')}</div>`;
    root.append(hc);
  }

  const move = (k) => { let m = M + k, y = Y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } ym = [y, m]; rerender(root, a); };
  card.querySelector('#prev').onclick = () => move(-1);
  card.querySelector('#next').onclick = () => move(1);
  card.querySelector('#todayBtn').onclick = () => { const t = new Date(); ym = [t.getFullYear(), t.getMonth()]; rerender(root, a); };
  card.querySelector('.cal-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.day');
    if (b) openDay(b.dataset.d);
  });
  let x0 = null, y0 = null;
  card.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  card.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
  });
}

function rerender(root, a) {
  root.innerHTML = '';
  renderCalendar(root, a);
}

export function setMonth(date) { ym = [Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1]; }

const hrs = (h) => (+h.toFixed(1)).toLocaleString('tr-TR');

// 24 saatlik nöbetin zaman çubuğu: hafta içi / hafta sonu / tatil parçaları
function timeline(p, settings) {
  const parts = [];
  for (const s of p.segments) {
    const hol = s.holidayHours;
    const rest = s.hours - hol;
    // arife öğleden sonra tatil olduğu için tatil kısmı günün sonunda
    if (rest > 0) parts.push({ h: rest, kind: s.weekend ? 'wk' : 'wd', day: s.day });
    if (hol > 0) parts.push({ h: hol, kind: 'hol', day: s.day });
  }
  const color = { wd: 'linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 70%,var(--accent2)))', wk: 'var(--wk)', hol: 'var(--bayram)' };
  const name = { wd: 'Hafta içi', wk: 'Hafta sonu', hol: 'Tatil' };
  const st = settings.startTime || '08:30';
  return `<div class="timeline">${parts.map((x) => `<div style="flex:${x.h};background:${color[x.kind]}" title="${name[x.kind]}">${x.h >= 7 ? `${name[x.kind]} ${hrs(x.h)}s` : x.h >= 2.5 ? `${hrs(x.h)}s` : ''}</div>`).join('')}</div>
    <div class="tl-cap"><span>${DOW_SHORT[p.dow]} ${st}</span><span>${DOW_SHORT[(p.dow + 1) % 7]} ${st}</span></div>`;
}

export function openDay(date) {
  const st = store.get();
  const a = analyze(st);
  const ents = a.hmap.get(date) || [];
  const isShift = store.hasShift(date);
  const p = isShift ? a.profiles.find((x) => x.date === date) : shiftProfile(date, st.settings, a.hmap);
  const prevShift = [...a.shifts].reverse().find((d) => d < date);
  const nextShift = a.shifts.find((d) => d > date);
  const gapPrev = prevShift ? dn(date) - dn(prevShift) : null;
  const gapNext = nextShift ? dn(nextShift) - dn(date) : null;
  const spillFrom = store.hasShift(addDaysIso(date, -1)) ? addDaysIso(date, -1) : null;
  const short = st.settings.shortGap;
  const warnGap = (g) => g != null && g < short;
  const dw = dowOf(date);

  const html = `
    <h3>${fmtDate(date, false)}</h3>
    <div class="sh-sub">${['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][dw]} · ${dw >= 5 ? 'Hafta sonu' : 'Hafta içi'}${isShift ? ' · <b style="color:var(--accent)">Nöbet günü</b>' : ''}</div>
    ${ents.length ? `<div class="hol-list">${ents.map((h) => `<div class="hol-item"><i style="background:${TYPE_COLOR[h.type]}"></i><span style="flex:1">${esc(h.name)}</span><span class="muted" style="font-size:12px">${TYPE_LABEL[h.type] || ''}</span></div>`).join('')}</div>` : ''}
    ${spillFrom && !isShift ? `<div class="alert info" style="margin:10px 0"><div class="a-ic">${icon('clock')}</div><div><b>Önceki günün nöbeti sarkıyor</b><p>${fmtDate(spillFrom)} nöbeti bu güne ${st.settings.startTime}'a kadar devam ediyor.</p></div></div>` : ''}
    <div style="margin-top:14px;font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">${isShift ? 'Bu nöbetin dağılımı' : 'Bu güne nöbet eklenirse'}</div>
    ${timeline(p, st.settings)}
    <div class="mini-stats">
      <div><b style="color:var(--wk)">${hrs(p.weekendH)}</b><span>saat hafta sonu</span></div>
      <div><b style="color:var(--bayram)">${hrs(p.holidayH)}</b><span>saat tatil</span></div>
      <div><b style="color:${warnGap(gapPrev) ? 'var(--bad)' : 'var(--text)'}">${gapPrev ?? '—'}</b><span>gün önceki nöbetten</span></div>
    </div>
    ${p.tags.length ? `<div class="tags" style="margin-bottom:12px">${tagHtml(p.tags)}</div>` : ''}
    ${!isShift && (warnGap(gapPrev) || warnGap(gapNext)) ? `<div class="alert warn" style="margin-bottom:12px"><div class="a-ic">${icon('alert')}</div><div><b>Kısa aralık</b><p>${warnGap(gapPrev) ? `Önceki nöbetten ${gapPrev} gün sonra. ` : ''}${warnGap(gapNext) ? `Sonraki nöbete ${gapNext} gün kalıyor.` : ''} (eşik ${short} gün)</p></div></div>` : ''}
    ${isShift ? `<label style="font-size:13px;font-weight:700;display:block;margin:6px 0 6px">Not</label>
      <textarea class="input" id="note" placeholder="Örn. değişim yapıldı, yerine tutuldu…">${esc(p.note || '')}</textarea>
      <div class="btn-row" style="margin-top:12px"><button class="btn ghost" id="close">Kapat</button><button class="btn danger" id="del">${icon('trash')}Nöbeti sil</button></div>`
      : `<div class="btn-row"><button class="btn ghost" id="close">Kapat</button><button class="btn primary" id="add">${icon('plus')}Nöbet ekle</button></div>`}
  `;
  openSheet(html, (sh) => {
    sh.querySelector('#close').onclick = () => closeSheet();
    const add = sh.querySelector('#add');
    if (add) add.onclick = () => { store.addShift(date); setMonth(date); closeSheet(); toast('Nöbet eklendi'); };
    const del = sh.querySelector('#del');
    if (del) del.onclick = () => {
      if (del.dataset.sure) { store.removeShift(date); closeSheet(); toast('Nöbet silindi'); }
      else { del.dataset.sure = '1'; del.innerHTML = `${icon('trash')}Emin misin? Tekrar dokun`; }
    };
    const note = sh.querySelector('#note');
    if (note) note.onchange = () => { store.setNote(date, note.value.trim()); toast('Not kaydedildi'); };
  });
}
