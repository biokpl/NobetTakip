import { mount, colors, levelColor, grad } from '../charts.js';
import { scoreLevel, fmtDate, fmtShort, dn, todayIso, demoShifts } from '../analysis.js';
import { icon, esc } from '../ui.js';
import { store } from '../store.js';
import { openDay } from './calendar.js';

const LEVEL_TEXT = { good: 'Adil görünüyor', mid: 'Dikkat gerektiriyor', bad: 'Adaletsiz görünüyor', none: 'Veri bekleniyor' };
const ALERT_ICON = { danger: 'flame', warn: 'alert', info: 'info', ok: 'check' };

export function renderPanel(root, a, app) {
  const c = colors();
  const s = a.scores;
  const lvl = scoreLevel(s?.total);

  // Puan kartı
  const hero = document.createElement('section');
  hero.className = 'card hero';
  hero.style.setProperty('--hero-glow', `color-mix(in srgb, ${levelColor(c, lvl)} 30%, transparent)`);
  hero.innerHTML = `
    <div class="card-head"><h2>Adalet puanı</h2><span class="badge ${lvl}">${LEVEL_TEXT[lvl]}</span></div>
    <div class="gauge" id="gauge"></div>
    <div class="hero-meta"><p>${a.baseline
      ? `${a.n} nöbet, ${fmtShort(a.baseline.from)} ${a.baseline.from.slice(0, 4)} – ${fmtShort(a.baseline.to)} ${a.baseline.to.slice(0, 4)} dönemi, rastgele dağıtımla kıyaslandı`
      : 'Puan için en az 3 nöbet gir'}</p></div>
    ${s ? `<div class="subscores">${[
      ['Hafta sonu yükü', s.weekend, `${Math.round(a.weekendH)} saat · beklenen ≈ ${Math.round(a.baseline.expWeekendH)} saat`],
      ['Tatil yükü', s.holiday, `${Math.round(a.holidayH)} saat · beklenen ≈ ${Math.round(a.baseline.expHolidayH)} saat`],
      ['Gün dağılımı', s.dow, a.baseline.pDow < 0.2 ? 'Bazı günlerde yığılma var' : 'Günlere dengeli yayılmış'],
      ['Aralık düzeni', s.gap, `${a.gaps.filter((g) => g.kind === 'short').length} kısa aralık · ort. ${Math.round(a.gapMean)} gün`],
    ].map(([name, v, d]) => {
      const col = levelColor(c, scoreLevel(v));
      return `<div class="ss-row"><span class="ss-name">${name}</span><span class="ss-val" style="color:${col}">${v}</span>
        <div class="ss-bar"><i style="width:${Math.max(3, v)}%;background:linear-gradient(90deg, color-mix(in srgb, ${col} 55%, transparent), ${col})"></i></div>
        <span class="ss-desc">${d}</span></div>`;
    }).join('')}</div>` : ''}
  `;
  root.append(hero);
  mountGauge(hero.querySelector('#gauge'), s?.total, lvl, c);

  // Boş durum
  if (!a.n) {
    const e = document.createElement('section');
    e.className = 'card';
    e.innerHTML = `<div class="empty">${icon('sparkle')}<div><b style="color:var(--text);font-size:15px">Başlayalım</b></div>
      <p>Geçmiş nöbet günlerini takvimden işaretle. Uygulama hafta sonu, tatil ve aralık dağılımını hesaplayıp seni uyaracak.</p></div>
      <div class="stack"><button class="btn primary" id="goCal">${icon('calendar')}Takvimde nöbet ekle</button>
      <button class="btn ghost" id="demo">${icon('sparkle')}Örnek veriyle dene</button></div>`;
    root.append(e);
    e.querySelector('#goCal').onclick = () => app.go('takvim');
    e.querySelector('#demo').onclick = () => store.replaceShifts(demoShifts());
  }

  // Sonraki nöbet
  if (a.n) root.append(nextCard(a));

  // Özet kutucuklar
  if (a.n) {
    const k = document.createElement('div');
    k.className = 'kpis';
    const b = a.baseline;
    const minG = a.gaps.length ? Math.min(...a.gaps.map((g) => g.days)) : null;
    const maxG = a.gaps.length ? Math.max(...a.gaps.map((g) => g.days)) : null;
    k.innerHTML = [
      kpi('Toplam nöbet', a.n, '', `${a.totalH.toLocaleString('tr-TR')} saat`, c.accent),
      kpi('Hafta sonu', a.weekendShifts, '', b ? `beklenen ≈ ${b.expWeekendShifts.toFixed(1)} · +${a.fridayShifts} Cuma` : `+${a.fridayShifts} Cuma sarkması`, c.wk),
      kpi('Tatile denk', a.holidayShifts, '', b ? `beklenen ≈ ${b.expHolidayShifts.toFixed(1)}` : 'resmi + dini', c.bayram),
      kpi('Ortalama ara', a.gaps.length ? Math.round(a.gapMean) : '—', a.gaps.length ? 'gün' : '', minG != null ? `en kısa ${minG} · en uzun ${maxG}` : 'en az 2 nöbet', c.accent2, true),
    ].join('');
    root.append(k);
    if (a.gaps.length > 1) {
      mount(k.querySelector('.k-spark'), {
        animationDuration: 1200,
        grid: { left: 0, right: 0, top: 4, bottom: 0 },
        xAxis: { type: 'category', show: false, data: a.gaps.map((_, i) => i) },
        yAxis: { type: 'value', show: false, min: (v) => v.min - 3 },
        series: [{ type: 'line', data: a.gaps.slice(-12).map((g) => g.days), smooth: true, symbol: 'none',
          lineStyle: { width: 2, color: c.accent2 }, areaStyle: { color: grad(c.accent2 + '66', c.accent2 + '00') } }],
        tooltip: { show: false },
      });
    }
  }

  // Uyarılar
  const al = document.createElement('section');
  al.className = 'card';
  al.innerHTML = `<div class="card-head"><h2>Uyarılar ve bilgiler</h2><span class="muted" style="font-size:12px;font-weight:700">${a.alerts.length}</span></div>
    <p class="hint">Hafta sonu, tatil, aynı gün serileri ve aralıklar sürekli kontrol edilir.</p>
    <div class="alerts">${a.alerts.map((x) => `<div class="alert ${x.level}"><div class="a-ic">${icon(ALERT_ICON[x.level])}</div>
      <div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div></div>`).join('')}</div>`;
  root.append(al);
}

function kpi(label, val, unit, sub, color, spark = false) {
  return `<div class="kpi"><div class="k-label"><i class="k-dot" style="background:${color}"></i>${label}</div>
    <div class="k-val">${val}${unit ? `<small>${unit}</small>` : ''}</div><div class="k-sub">${sub}</div>${spark ? '<div class="k-spark"></div>' : ''}</div>`;
}

function mountGauge(el, value, lvl, c) {
  const col = levelColor(c, lvl);
  mount(el, {
    animationDuration: 1600,
    series: [{
      type: 'gauge', startAngle: 215, endAngle: -35, min: 0, max: 100, radius: '88%', center: ['50%', '58%'],
      progress: { show: value != null, roundCap: true, width: 18,
        itemStyle: { color: grad(c.accent, col, true), shadowBlur: 18, shadowColor: col + '88' } },
      axisLine: { roundCap: true, lineStyle: { width: 18, color: [[1, c.hi]] } },
      pointer: { show: false },
      axisTick: { show: true, distance: -34, length: 4, splitNumber: 2, lineStyle: { color: c.faint, width: 1.5 } },
      splitLine: { show: true, distance: -38, length: 8, lineStyle: { color: c.faint, width: 2 } },
      axisLabel: { show: true, distance: -16, color: c.faint, fontSize: 10, fontWeight: 700, formatter: (v) => (v % 50 === 0 ? v : '') },
      anchor: { show: false },
      title: { show: true, offsetCenter: [0, '34%'], color: c.muted, fontSize: 12, fontWeight: 700 },
      detail: {
        valueAnimation: true, offsetCenter: [0, '-2%'], fontSize: 58, fontWeight: 800, color: c.text,
        formatter: (v) => (value == null ? '—' : Math.round(v)),
      },
      data: [{ value: value ?? 0, name: '/ 100' }],
    }],
  });
}

function nextCard(a) {
  const el = document.createElement('section');
  el.className = 'card';
  const today = dn(todayIso());
  let ring = '', lbl = '', dt = '', tags = '', extra = '';
  let p = 0;
  if (a.current) {
    const [hh, mm] = (store.get().settings.startTime || '08:30').split(':').map(Number);
    const [y, m, d] = a.current.date.split('-').map(Number);
    const start = new Date(y, m - 1, d, hh, mm);
    const left = Math.max(0, (+start + 24 * 3600e3 - Date.now()) / 3600e3);
    p = 100 - (left / 24) * 100;
    ring = `<span>${Math.ceil(left)}<small>saat kaldı</small></span>`;
    lbl = 'Şu an nöbettesin'; dt = fmtDate(a.current.date);
    tags = tagHtml(a.current.tags);
  } else if (a.nextPlanned) {
    const days = dn(a.nextPlanned.date) - today;
    const prev = a.last ? dn(a.last.date) : dn(a.nextPlanned.date) - 40;
    p = Math.min(100, ((today - prev) / Math.max(1, dn(a.nextPlanned.date) - prev)) * 100);
    ring = `<span>${days}<small>${days === 0 ? 'bugün' : 'gün kaldı'}</small></span>`;
    lbl = 'Sıradaki nöbet'; dt = fmtDate(a.nextPlanned.date);
    tags = tagHtml(a.nextPlanned.tags) || '<span class="tag">Hafta içi, tatil yok</span>';
  } else if (a.prediction) {
    const pr = a.prediction;
    const days = dn(pr.center) - today;
    p = Math.min(100, ((today - dn(a.last.date)) / Math.max(1, pr.avg)) * 100);
    ring = `<span>${days >= 0 ? days : '?'}<small>${days >= 0 ? 'gün (tahmini)' : 'gecikti'}</small></span>`;
    lbl = 'Tahmini sonraki nöbet'; dt = `${fmtShort(pr.lo)} – ${fmtShort(pr.hi)}`;
    tags = `<span class="tag">ort. ${Math.round(pr.avg)} gün ara</span><span class="tag wk">${pr.wkDays}/${pr.span} gün hafta sonu</span>` +
      [...new Set(pr.holidays.filter((h) => h.type !== 'ozel').map((h) => h.group || h.name))].slice(0, 3).map((n) => `<span class="tag hol">${esc(n)}</span>`).join('');
    extra = '<p class="hint" style="margin:10px 0 0">Kesin tarihi öğrenince takvimden ekle; sayaç ve uyarılar ona göre güncellenir.</p>';
  } else return document.createDocumentFragment();
  el.innerHTML = `<div class="next"><div class="next-ring" style="--p:${p.toFixed(1)}">${ring}</div>
    <div class="next-info"><div class="lbl">${lbl}</div><div class="dt">${dt}</div><div class="tags">${tags}</div></div></div>${extra}`;
  const target = a.current || a.nextPlanned;
  if (target) { el.style.cursor = 'pointer'; el.onclick = () => openDay(target.date); }
  return el;
}

export const tagHtml = (tags) => tags.map((t) => `<span class="tag ${t.c}">${esc(t.t)}</span>`).join('');
