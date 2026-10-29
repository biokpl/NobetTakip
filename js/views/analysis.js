import { mount, colors, grad, axisStyle } from '../charts.js';
import { DOW_SHORT, DOW_LONG, CATEGORIES, fmtShort, MONTHS } from '../analysis.js';
import { icon, esc } from '../ui.js';
import { openDay } from './calendar.js';
import { tagHtml } from './panel.js';

let cumMode = 'weekend';
let heatYear = null;

function card(root, title, hint, body) {
  const el = document.createElement('section');
  el.className = 'card';
  el.innerHTML = `${typeof title === 'string' ? `<h2>${title}</h2>` : ''}${hint ? `<p class="hint">${hint}</p>` : ''}${body}`;
  root.append(el);
  return el;
}

export function renderAnalysis(root, a) {
  const c = colors();
  if (a.n < 2) {
    card(root, 'Analiz', '', `<div class="empty">${icon('chart')}<p>Grafikler için en az 2–3 nöbet gir. Takvim sekmesinden geçmiş nöbetlerini işaretleyebilirsin.</p></div>`);
    return;
  }
  const b = a.baseline;

  // 1) Gün dağılımı radarı
  const maxI = a.dowCounts.indexOf(Math.max(...a.dowCounts));
  const zero = a.dowCounts.map((v, i) => (v === 0 ? DOW_LONG[i] : null)).filter(Boolean);
  const r = card(root, 'Hangi günlere denk geliyor?', 'Mor alan senin nöbetlerin, kesikli çizgi adil (rastgele) dağılımda beklenen.',
    `<div class="chart tall" id="radar"></div><div class="chart-note">En çok <b>${DOW_LONG[maxI]}</b> (${a.dowCounts[maxI]} kez)${zero.length ? ` · hiç denk gelmeyen: <b>${zero.join(', ')}</b>` : ''}.</div>`);
  const exp = b ? b.expDow : a.dowCounts.map(() => a.n / 7);
  const rmax = Math.max(...a.dowCounts, ...exp) * 1.15 || 1;
  mount(r.querySelector('#radar'), {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: c.muted, fontWeight: 700, fontSize: 11 }, itemWidth: 12, itemHeight: 8, icon: 'roundRect' },
    radar: {
      indicator: DOW_SHORT.map((n) => ({ name: n, max: rmax })), radius: '66%', center: ['50%', '46%'], splitNumber: 4,
      axisName: { color: c.text, fontWeight: 800, fontSize: 12 },
      splitLine: { lineStyle: { color: c.line } }, splitArea: { areaStyle: { color: ['transparent', c.hi] } }, axisLine: { lineStyle: { color: c.line } },
    },
    series: [{
      type: 'radar', symbolSize: 6,
      data: [
        { name: 'Beklenen', value: exp.map((x) => +x.toFixed(2)), lineStyle: { type: 'dashed', color: c.faint, width: 1.5 }, itemStyle: { color: c.faint }, symbol: 'none', areaStyle: { color: 'transparent' } },
        { name: 'Senin nöbetlerin', value: a.dowCounts, lineStyle: { color: c.accent, width: 2.5 }, itemStyle: { color: c.accent, borderColor: '#fff', borderWidth: 1.5 },
          areaStyle: { color: new echarts.graphic.RadialGradient(0.5, 0.5, 1, [{ offset: 0, color: c.accent + '22' }, { offset: 1, color: c.accent2 + '88' }]) } },
      ],
    }],
  });

  // 2) Saat dağılımı halkası
  let wd = 0, wk = 0, hol = 0;
  a.profiles.forEach((p) => p.segments.forEach((s) => { hol += s.holidayHours; if (s.weekend) wk += s.hours - s.holidayHours; else wd += s.hours - s.holidayHours; }));
  const tot = wd + wk + hol;
  const d = card(root, 'Nöbet saatlerin nereye gitti?', `24 saatlik nöbetler gece yarısını geçtiği için saat bazında hesaplandı. Adil dağılımda hafta sonu payı ≈ %${b ? Math.round((b.expWeekendH / a.totalH) * 100) : 29}.`,
    `<div class="chart" id="donut"></div>`);
  mount(d.querySelector('#donut'), {
    tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br><b>${Math.round(p.value)} saat</b> · %${p.percent.toFixed(1)}` },
    legend: { bottom: 0, textStyle: { color: c.muted, fontWeight: 700, fontSize: 11 }, itemWidth: 10, itemHeight: 10, icon: 'circle' },
    title: { text: Math.round(tot).toLocaleString('tr-TR'), subtext: 'toplam saat', left: 'center', top: '34%',
      textStyle: { color: c.text, fontSize: 28, fontWeight: 800 }, subtextStyle: { color: c.muted, fontSize: 12, fontWeight: 700 } },
    series: [{
      type: 'pie', radius: ['56%', '78%'], center: ['50%', '45%'], padAngle: 3, itemStyle: { borderRadius: 10 },
      label: { show: true, position: 'outside', formatter: (p) => `%${Math.round(p.percent)}`, color: c.text, fontWeight: 800, fontSize: 12 },
      labelLine: { length: 6, length2: 6, lineStyle: { color: c.line } },
      data: [
        { name: 'Hafta içi', value: wd, itemStyle: { color: grad(c.accent, c.accent2) } },
        { name: 'Hafta sonu', value: wk, itemStyle: { color: c.wk } },
        { name: 'Tatil', value: hol, itemStyle: { color: c.bayram } },
      ].filter((x) => x.value > 0),
    }],
  });

  // 3) Birikimli fark
  if (b) {
    const cum = card(root, null, '', `<div class="card-head"><h2>Zamanla fark açılıyor mu?</h2>
      <div class="seg" id="cumSeg"><button data-m="weekend">Hafta sonu</button><button data-m="holiday">Tatil</button></div></div>
      <p class="hint" style="margin-top:6px">Gerçek birikimli saatlerin, adil dağılımda beklenen çizgiyle karşılaştırması. Çizgi ne kadar üstteyse o kadar fazla yük.</p>
      <div class="chart" id="cum"></div><div class="chart-note" id="cumNote"></div>`);
    const draw = () => {
      cum.querySelectorAll('#cumSeg button').forEach((x) => x.classList.toggle('on', x.dataset.m === cumMode));
      const key = cumMode === 'weekend' ? 'weekendH' : 'holidayH';
      const per = (cumMode === 'weekend' ? b.expWeekendH : b.expHolidayH) / a.n;
      let s = 0;
      const actual = a.profiles.map((p) => (s += p[key]));
      const expected = a.profiles.map((_, i) => +(per * (i + 1)).toFixed(1));
      const col = cumMode === 'weekend' ? c.wk : c.bayram;
      const diff = actual[actual.length - 1] - expected[expected.length - 1];
      cum.querySelector('#cumNote').innerHTML = `Şu an beklenenden <b style="color:${diff > 0 ? c.bad : c.good}">${diff > 0 ? '+' : ''}${Math.round(diff)} saat</b> ${diff > 0 ? 'fazla' : 'az'} ${cumMode === 'weekend' ? 'hafta sonu' : 'tatil'} nöbeti tuttun.`;
      const el = cum.querySelector('#cum');
      const old = echarts.getInstanceByDom(el); if (old) old.dispose();
      mount(el, {
        grid: { left: 40, right: 12, top: 16, bottom: 28 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: a.profiles.map((p) => fmtShort(p.date) + ' ' + p.date.slice(2, 4)), boundaryGap: false, ...axisStyle(c), axisLabel: { ...axisStyle(c).axisLabel, hideOverlap: true } },
        yAxis: { type: 'value', ...axisStyle(c), axisLine: { show: false } },
        series: [
          { name: 'Beklenen', type: 'line', data: expected, symbol: 'none', lineStyle: { type: 'dashed', color: c.faint, width: 1.5 } },
          { name: 'Gerçek', type: 'line', data: actual.map((x) => +x.toFixed(1)), smooth: 0.25, symbol: 'circle', symbolSize: 5, step: false,
            lineStyle: { width: 3, color: col, shadowBlur: 12, shadowColor: col + '66' }, itemStyle: { color: col },
            areaStyle: { color: grad(col + '55', col + '00') } },
        ],
      });
    };
    cum.querySelector('#cumSeg').onclick = (e) => { const m = e.target.closest('button')?.dataset.m; if (m) { cumMode = m; draw(); } };
    draw();
  }

  // 4) Aralıklar
  if (a.gaps.length) {
    const st = a.gaps;
    const g = card(root, 'İki nöbet arası kaç gün?', `Yeşil bant normal aralık (${shortG(a)}–${longG(a)} gün). Kırmızı çubuklar kısa, mavi çubuklar uzun aralıklar.`,
      `<div class="chart" id="gaps"></div><div class="chart-note">Ortalama <b>${a.gapMean.toFixed(1)} gün</b> · sapma ±${a.gapStd.toFixed(1)} · en kısa <b>${Math.min(...st.map((x) => x.days))}</b> · en uzun <b>${Math.max(...st.map((x) => x.days))}</b></div>`);
    mount(g.querySelector('#gaps'), {
      grid: { left: 34, right: 28, top: 18, bottom: 28 },
      tooltip: { trigger: 'axis', formatter: (ps) => { const x = st[ps[0].dataIndex]; return `${fmtShort(x.from)} → ${fmtShort(x.to)} ${x.to.slice(0, 4)}<br><b>${x.days} gün</b>`; } },
      xAxis: { type: 'category', data: st.map((x) => fmtShort(x.to)), ...axisStyle(c), axisLabel: { ...axisStyle(c).axisLabel, hideOverlap: true } },
      yAxis: { type: 'value', min: (v) => Math.max(0, Math.floor(v.min / 10) * 10 - 10), ...axisStyle(c), axisLine: { show: false } },
      series: [{
        type: 'bar', barMaxWidth: 18,
        data: st.map((x) => ({ value: x.days, itemStyle: { borderRadius: [6, 6, 2, 2], color: x.kind === 'short' ? grad(c.bad, c.bad + '55') : x.kind === 'long' ? grad(c.accent2, c.accent2 + '55') : grad(c.accent, c.accent + '55') } })),
        markArea: { silent: true, itemStyle: { color: c.good + '14' }, data: [[{ yAxis: shortG(a) }, { yAxis: longG(a) }]] },
        markLine: { silent: true, symbol: 'none', label: { formatter: 'ort.', color: c.muted, fontSize: 10, fontWeight: 700 }, lineStyle: { color: c.good, type: 'dashed' }, data: [{ yAxis: +a.gapMean.toFixed(1) }] },
      }],
    });
  }

  // 5) Tatil türleri
  const cats = CATEGORIES.filter((k) => a.catCounts[k] > 0 || (b && b.expCat[k] >= 0.3));
  if (cats.length) {
    const t = card(root, 'Tatil ve özel günler', 'Kaç nöbetin bu günlere dokunduğu ve adil dağılımda beklenen sayı.', `<div class="chart" id="cats" style="height:${70 + cats.length * 44}px"></div>`);
    mount(t.querySelector('#cats'), {
      grid: { left: 112, right: 26, top: 8, bottom: 44 },
      legend: { bottom: 0, textStyle: { color: c.muted, fontWeight: 700, fontSize: 11 }, itemWidth: 12, itemHeight: 8, icon: 'roundRect' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', minInterval: 1, ...axisStyle(c) },
      yAxis: { type: 'category', data: cats, inverse: true, ...axisStyle(c), axisLabel: { ...axisStyle(c).axisLabel, color: c.text } },
      series: [
        { name: 'Gerçek', type: 'bar', barWidth: 12, data: cats.map((k) => a.catCounts[k]), itemStyle: { borderRadius: 6, color: grad(c.bayram + '88', c.bayram, true) },
          label: { show: true, position: 'right', color: c.text, fontWeight: 800, fontSize: 11 } },
        ...(b ? [{ name: 'Beklenen', type: 'bar', barWidth: 6, data: cats.map((k) => +b.expCat[k].toFixed(1)), itemStyle: { borderRadius: 4, color: c.faint } }] : []),
      ],
    });
  }

  // 6) Yıllık ısı haritası
  const years = [...new Set(a.shifts.map((s) => s.slice(0, 4)))];
  if (!heatYear || !years.includes(heatYear)) heatYear = years[years.length - 1];
  const h = card(root, null, '', `<div class="card-head"><h2>Yıl haritası</h2><div class="seg" id="ySeg">${years.slice(-4).map((y) => `<button data-y="${y}">${y}</button>`).join('')}</div></div>
    <p class="hint" style="margin-top:6px">Her satır bir ay, her kare bir gün. Nöbetlerin hangi aylara ve hafta sonlarına yığıldığını bir bakışta gösterir.</p><div class="chart heat" id="heat"></div>
    <div class="legend" style="margin-top:6px">
      <span><i style="background:var(--accent)"></i>Nöbet</span><span><i style="background:var(--wk)"></i>Hafta sonu nöbeti</span>
      <span><i style="background:var(--bayram)"></i>Tatil nöbeti</span><span><i style="background:color-mix(in srgb,var(--accent) 40%,transparent)"></i>Sabaha sarkma</span>
      <span><i style="background:color-mix(in srgb,var(--hol) 40%,transparent)"></i>Tatil günü</span><span><i style="background:color-mix(in srgb,var(--wk) 19%,transparent)"></i>Hafta sonu</span>
    </div>`);
  const drawHeat = () => {
    h.querySelectorAll('#ySeg button').forEach((x) => x.classList.toggle('on', x.dataset.y === heatYear));
    const Y = Number(heatYear);
    const shiftOf = new Map(a.profiles.map((p) => [p.date, p]));
    const LBL = { 0: 'Hafta içi', 0.2: 'Hafta sonu', 0.5: 'Sabaha sarkma', 1: 'Tatil günü', 2: 'Nöbet', 3: 'Hafta sonu nöbeti', 4: 'Tatil nöbeti' };
    const data = [];
    for (let m = 0; m < 12; m++) {
      for (let d = 1; d <= 31; d++) {
        const dt = new Date(Date.UTC(Y, m, d));
        if (dt.getUTCMonth() !== m) continue;
        const day = `${Y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const sp = shiftOf.get(day);
        const prev = shiftOf.get(fromIso(day, -1));
        const ents = (a.hmap.get(day) || []).filter((x) => ['resmi', 'dini', 'arife', 'kurum'].includes(x.type));
        const wd = (dt.getUTCDay() + 6) % 7;
        const v = sp ? (sp.isHoliday ? 4 : sp.isWeekend ? 3 : 2) : prev ? 0.5 : ents.length ? 1 : wd >= 5 ? 0.2 : 0;
        data.push({ value: [d - 1, m, v], day, names: ents.map((x) => x.name) });
      }
    }
    const el = h.querySelector('#heat');
    const old = echarts.getInstanceByDom(el); if (old) old.dispose();
    el.style.height = '290px';
    mount(el, {
      tooltip: { formatter: (p) => `${fmtShort(p.data.day)} ${heatYear}<br><b>${LBL[p.data.value[2]]}</b>${p.data.names.length ? '<br>' + p.data.names.map(esc).join('<br>') : ''}` },
      grid: { left: 34, right: 4, top: 18, bottom: 4 },
      xAxis: { type: 'category', data: Array.from({ length: 31 }, (_, i) => i + 1), position: 'top', axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: c.faint, fontSize: 9, fontWeight: 700, interval: (i) => [0, 4, 9, 14, 19, 24, 29].includes(i) } },
      yAxis: { type: 'category', data: MONTHS.map((x) => x.slice(0, 3)), inverse: true, axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: c.muted, fontSize: 10, fontWeight: 700 } },
      visualMap: { type: 'piecewise', dimension: 2, show: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 10, itemGap: 8,
        textStyle: { color: c.muted, fontSize: 10, fontWeight: 700 },
        pieces: [
          { value: 2, label: 'Nöbet', color: c.accent }, { value: 3, label: 'H.sonu', color: c.wk }, { value: 4, label: 'Tatil nöbeti', color: c.bayram },
          { value: 0.5, label: 'Sarkma', color: c.accent + '66' }, { value: 1, label: 'Tatil', color: c.hol + '66' },
          { value: 0.2, label: 'H.sonu günü', color: c.wk + '30' }, { value: 0, label: '', color: c.hi },
        ] },
      series: [{ type: 'heatmap', data, itemStyle: { borderRadius: 3, borderColor: c.card, borderWidth: 2 },
        emphasis: { itemStyle: { borderColor: c.text, borderWidth: 1 } } }],
    });
  };
  h.querySelector('#ySeg').onclick = (e) => { const y = e.target.closest('button')?.dataset.y; if (y) { heatYear = y; drawHeat(); } };
  requestAnimationFrame(drawHeat);

  // 7) Yıllık özet
  if (a.years.length) {
    card(root, 'Yıllara göre', '', `<table class="table"><thead><tr><th>Yıl</th><th>Nöbet</th><th>H.sonu</th><th>Tatil</th><th>H.sonu saat</th></tr></thead><tbody>
      ${a.years.map((y) => `<tr><td><b>${y.year}</b></td><td>${y.count}</td><td>${y.weekend}</td><td>${y.holiday}</td><td>${Math.round(y.weekendH)}</td></tr>`).join('')}</tbody></table>`);
  }

  // 8) Geçmiş
  const gapTo = new Map(a.gaps.map((g) => [g.to, g]));
  const list = [...a.profiles].reverse();
  const hc = card(root, 'Nöbet geçmişi', 'Detay için dokun.', `<div class="hist">${list.map((p) => {
    const g = gapTo.get(p.date);
    const [y, m, dd] = p.date.split('-');
    return `<div class="hist-item" data-d="${p.date}"><div class="hist-date"><b>${Number(dd)}</b><span>${MONTHS[m - 1].slice(0, 3)} ${y.slice(2)}</span></div>
      <div class="hist-main"><div class="t">${DOW_LONG[p.dow]}${p.note ? ` · <span class="muted" style="font-weight:600">${esc(p.note)}</span>` : ''}</div><div class="tags">${tagHtml(p.tags) || '<span class="tag">Hafta içi</span>'}</div></div>
      <div class="hist-gap ${g ? g.kind : ''}">${g ? `<b>${g.days}</b>gün ara` : '<b>—</b>ilk'}</div></div>`;
  }).join('')}</div>`);
  hc.querySelector('.hist').onclick = (e) => { const it = e.target.closest('.hist-item'); if (it) openDay(it.dataset.d); };
}

const fromIso = (s, k) => { const t = new Date(s + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
const shortG = (a) => a.settings.shortGap;
const longG = (a) => a.settings.longGap;
