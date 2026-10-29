import { store } from '../store.js';
import { holidaysOfYear, TYPE_LABEL } from '../holidays.js';
import { fmtDate, demoShifts, DOW_SHORT, dowOf } from '../analysis.js';
import { icon, esc, toast, downloadFile } from '../ui.js';
import { setMonth } from './calendar.js';

let holYear = String(new Date().getFullYear());

function section(root, html) {
  const el = document.createElement('section');
  el.className = 'card';
  el.innerHTML = html;
  root.append(el);
  return el;
}

export function renderSettings(root, a, app) {
  const st = store.get();
  const s = st.settings;

  // Nöbet ayarları
  const n = section(root, `<h2>Nöbet ayarları</h2>
    <div class="field"><label>Nöbet başlangıç saati<small>24 saat sürer, ertesi gün aynı saatte biter</small></label><input type="time" class="input" id="startTime" value="${s.startTime}"></div>
    <div class="field"><label>Kısa aralık eşiği<small>Bundan kısa aralıklar uyarı verir (gün)</small></label><input type="number" class="input num" id="shortGap" min="1" max="120" value="${s.shortGap}"></div>
    <div class="field"><label>Uzun aralık eşiği<small>Bundan uzun aralıklar bilgi olarak gösterilir</small></label><input type="number" class="input num" id="longGap" min="1" max="365" value="${s.longGap}"></div>
    <div class="field"><label>Kıyas başlangıcı<small>Boşsa ilk nöbet tarihi. Sıraya girdiğin tarihi yazabilirsin.</small></label><input type="date" class="input" id="periodStart" value="${s.periodStart}"></div>`);
  n.querySelector('#startTime').onchange = (e) => { store.setSetting('startTime', e.target.value || '08:30'); toast('Kaydedildi'); };
  n.querySelector('#shortGap').onchange = (e) => store.setSetting('shortGap', Math.max(1, Number(e.target.value) || 28));
  n.querySelector('#longGap').onchange = (e) => store.setSetting('longGap', Math.max(1, Number(e.target.value) || 50));
  n.querySelector('#periodStart').onchange = (e) => store.setSetting('periodStart', e.target.value);

  // Hızlı ekleme
  const q = section(root, `<h2>Tarihle hızlı ekle</h2><p class="hint">Eski nöbetleri girerken takvimde ay ay gezmek yerine tarihi seç.</p>
    <div style="display:grid;grid-template-columns:1fr auto;gap:10px"><input type="date" class="input" id="qDate"><button class="btn primary" id="qAdd" style="width:auto;padding:0 18px">${icon('plus')}Ekle</button></div>
    <p class="hint" id="qInfo" style="margin:8px 0 0"></p>`);
  const qd = q.querySelector('#qDate');
  qd.oninput = () => { q.querySelector('#qInfo').textContent = qd.value ? `${fmtDate(qd.value)}${store.hasShift(qd.value) ? ' — zaten kayıtlı' : ''}` : ''; };
  q.querySelector('#qAdd').onclick = () => {
    if (!qd.value) return toast('Önce tarih seç');
    if (store.hasShift(qd.value)) return toast('Bu tarih zaten kayıtlı');
    store.addShift(qd.value); setMonth(qd.value); toast(`${qd.value.split('-').reverse().join('.')} eklendi`);
  };

  // Görünüm
  const g = section(root, `<div class="row-between"><h2 style="margin:0">Tema</h2><div class="seg" id="theme"><button data-t="dark">Koyu</button><button data-t="light">Açık</button></div></div>`);
  g.querySelectorAll('#theme button').forEach((b) => b.classList.toggle('on', b.dataset.t === s.theme));
  g.querySelector('#theme').onclick = (e) => { const t = e.target.closest('button')?.dataset.t; if (t) store.setSetting('theme', t); };

  // Hatırlatma
  const next = a.nextPlanned;
  const r = section(root, `<h2>Hatırlatma</h2>
    <p class="hint">${next ? `Sıradaki nöbetin <b style="color:var(--text)">${fmtDate(next.date)}</b>. Telefon takvimine ekle; 1 gün ve 2 saat önce alarm çalar.` : 'Gelecek bir nöbet girdiğinde telefon takvimine alarmlı olarak ekleyebilirsin.'}</p>
    <button class="btn ghost" id="ics" ${next ? '' : 'disabled style="opacity:.5"'}>${icon('bell')}Takvime ekle (.ics)</button>`);
  if (next) r.querySelector('#ics').onclick = () => downloadFile(`nobet-${next.date}.ics`, ics(next.date, s), 'text/calendar');

  // Yedek
  const y = section(root, `<h2>Yedek ve veri</h2><p class="hint">Veriler sadece bu telefonda saklanır. Telefon değiştirirken veya tarayıcı verisini silmeden önce yedek al.</p>
    <div class="btn-row"><button class="btn ghost" id="exp">${icon('download')}Yedek al</button><button class="btn ghost" id="imp">${icon('upload')}Yedek yükle</button></div>
    <input type="file" id="file" accept="application/json,.json" hidden>
    <div class="stack" style="margin-top:10px">
      ${st.shifts.length ? '' : `<button class="btn ghost" id="demo">${icon('sparkle')}Örnek veri yükle</button>`}
      <button class="btn danger" id="wipe">${icon('trash')}Tüm nöbetleri sil</button>
    </div>`);
  y.querySelector('#exp').onclick = () => downloadFile(`nobet-yedek-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON());
  y.querySelector('#imp').onclick = () => y.querySelector('#file').click();
  y.querySelector('#file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { store.importJSON(await f.text()); toast('Yedek yüklendi'); } catch (err) { toast('Hata: ' + err.message); }
  };
  const demo = y.querySelector('#demo');
  if (demo) demo.onclick = () => { store.replaceShifts(demoShifts()); toast('Örnek veri yüklendi'); app.go('panel'); };
  const wipe = y.querySelector('#wipe');
  wipe.onclick = () => {
    if (!st.shifts.length) return toast('Silinecek nöbet yok');
    if (wipe.dataset.sure) { store.replaceShifts([]); toast('Tüm nöbetler silindi'); }
    else { wipe.dataset.sure = '1'; wipe.innerHTML = `${icon('trash')}${st.shifts.length} nöbet silinecek — emin misin?`; }
  };

  // Tatil listesi
  const years = [];
  for (let k = 2024; k <= 2030; k++) years.push(String(k));
  const hidden = new Set(st.hiddenHolidays);
  const list = [...holidaysOfYear(Number(holYear)), ...st.customHolidays.filter((h) => h.date.startsWith(holYear)).map((h) => ({ ...h, custom: true }))]
    .sort((x, z) => x.date.localeCompare(z.date));
  const h = section(root, `<h2>Tatil listesi</h2>
    <p class="hint">Resmi tatiller, bayramlar (arife yarım gün: 13:00'ten sonra) ve kandiller. "(tahmini)" ve "(hesaplanan)" yazanları Diyanet takvimiyle kontrol et; yanlışsa gizleyip doğrusunu ekle.</p>
    <div class="seg" id="hy" style="flex-wrap:wrap">${years.map((x) => `<button data-y="${x}">${x}</button>`).join('')}</div>
    <div class="hol-year">${list.map((x) => {
      const key = x.date + '|' + x.name;
      const off = hidden.has(key);
      return `<div class="hy ${off ? 'off' : ''}"><span class="muted" style="font-weight:700">${x.date.slice(8)}.${x.date.slice(5, 7)} ${DOW_SHORT[dowOf(x.date)]}</span>
        <span><b style="font-weight:700">${esc(x.name)}</b><br><span class="muted" style="font-size:11px">${TYPE_LABEL[x.type] || ''}</span></span>
        ${x.custom ? `<button data-del="${esc(key)}">Sil</button>` : `<button data-hide="${esc(key)}">${off ? 'Göster' : 'Gizle'}</button>`}</div>`;
    }).join('')}</div>
    <h2 style="margin-top:16px;font-size:14px">Özel gün ekle</h2>
    <p class="hint">Kurum tatili, idari izin veya düzeltilmiş bayram tarihi gibi.</p>
    <div class="stack">
      <input type="date" class="input" id="hDate">
      <input type="text" class="input" id="hName" placeholder="Adı (örn. İdari izin)">
      <select class="input" id="hType">
        <option value="kurum">Kurum tatili (tam gün)</option><option value="resmi">Resmi tatil (tam gün)</option>
        <option value="dini">Dini bayram (tam gün)</option><option value="arife">Arife (13:00 sonrası)</option><option value="kandil">Kandil gecesi</option>
      </select>
      <button class="btn ghost" id="hAdd">${icon('plus')}Ekle</button>
    </div>`);
  h.querySelectorAll('#hy button').forEach((b) => b.classList.toggle('on', b.dataset.y === holYear));
  h.querySelector('#hy').onclick = (e) => { const yy = e.target.closest('button')?.dataset.y; if (yy) { holYear = yy; app.refresh(); } };
  h.querySelector('.hol-year').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.hide) store.toggleHidden(b.dataset.hide);
    if (b.dataset.del) { const [d, ...nm] = b.dataset.del.split('|'); store.removeCustomHoliday(d, nm.join('|')); }
  };
  h.querySelector('#hAdd').onclick = () => {
    const date = h.querySelector('#hDate').value, name = h.querySelector('#hName').value.trim(), type = h.querySelector('#hType').value;
    if (!date || !name) return toast('Tarih ve ad gerekli');
    const group = type === 'dini' ? (/kurban/i.test(name) ? 'Kurban Bayramı' : /ramazan/i.test(name) ? 'Ramazan Bayramı' : undefined) : undefined;
    holYear = date.slice(0, 4);
    store.addCustomHoliday({ date, name, type, ...(group ? { group } : {}) });
    toast('Özel gün eklendi');
  };

  // Yöntem
  section(root, `<h2>Puan nasıl hesaplanıyor?</h2>
    <p class="hint" style="margin:0">Uygulama, girdiğin dönem boyunca nöbetlerin <b style="color:var(--text)">rastgele ve eşit dağıtılsaydı</b> neye benzeyeceğini 3000 kez simüle eder.
    Senin hafta sonu ve tatil saatlerin bu simülasyonların ne kadarından yüksekse puan o kadar düşer. Böylece az nöbetle bile "şans eseri mi, gerçekten fazla mı?" sorusu yanıtlanır.
    Toplam puan: hafta sonu %35, tatil %30, gün dağılımı %20, aralık düzeni %15.
    Nöbet 24 saat sürdüğü için saatler gün gün bölünür: Cuma nöbetinin 8,5 saati Cumartesiye, arife nöbetinin akşamı bayrama sayılır.</p>`);
}

function ics(date, s) {
  const [hh, mm] = s.startTime.split(':');
  const d = date.replace(/-/g, '');
  const end = new Date(date + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 1);
  const e = end.toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NobetTakip//TR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:nobet-${d}@nobettakip`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Istanbul:${d}T${hh}${mm}00`, `DTEND;TZID=Europe/Istanbul:${e}T${hh}${mm}00`,
    'SUMMARY:24 saat nöbet', 'DESCRIPTION:Nöbet Takip uygulamasından eklendi',
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Yarın nöbetin var', 'END:VALARM',
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:2 saat sonra nöbet başlıyor', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
