// ECharts sarmalayıcı: tema renkleri CSS değişkenlerinden okunur
const instances = new Set();

export function colors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    text: v('--text'), muted: v('--muted'), faint: v('--faint'), line: v('--line'), card: v('--card-solid'),
    accent: v('--accent'), accent2: v('--accent2'), good: v('--good'), mid: v('--mid'), bad: v('--bad'),
    wk: v('--wk'), hol: v('--hol'), bayram: v('--bayram'), night: v('--night'), hi: v('--card-hi'),
  };
}

export const levelColor = (c, lvl) => (lvl === 'good' ? c.good : lvl === 'mid' ? c.mid : lvl === 'bad' ? c.bad : c.faint);

export function grad(c1, c2, horizontal = false) {
  return new echarts.graphic.LinearGradient(0, 0, horizontal ? 1 : 0, horizontal ? 0 : 1, [
    { offset: 0, color: c1 }, { offset: 1, color: c2 },
  ]);
}

export function mount(el, option) {
  if (!el || typeof echarts === 'undefined') return null;
  const ch = echarts.init(el, null, { renderer: 'canvas' });
  const c = colors();
  ch.setOption({
    textStyle: { fontFamily: 'Manrope, system-ui, sans-serif', color: c.text },
    animationDuration: 900,
    animationEasing: 'cubicOut',
    tooltip: {
      backgroundColor: c.card, borderColor: c.line, borderWidth: 1, padding: [8, 12],
      textStyle: { color: c.text, fontSize: 12 }, extraCssText: 'border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);',
    },
    ...option,
  });
  instances.add(ch);
  return ch;
}

export function disposeAll() {
  instances.forEach((ch) => ch.dispose());
  instances.clear();
}

let rt;
window.addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => instances.forEach((ch) => ch.resize()), 120);
});

export function axisStyle(c) {
  return {
    axisLine: { lineStyle: { color: c.line } },
    axisTick: { show: false },
    axisLabel: { color: c.muted, fontSize: 11, fontWeight: 600 },
    splitLine: { lineStyle: { color: c.line } },
  };
}
