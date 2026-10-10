// يولّد صفحة Artifact مستقلة (بيانات مضمّنة، بلا خادم) من _c.json
const fs = require('fs');
const path = require('path');

const items = JSON.parse(fs.readFileSync(path.join(__dirname, '_c.json'), 'utf8'));

// مصفوفة مضغوطة بترتيب ثابت للأعمدة لتقليل الحجم
// [sako, barcode, name, nameEn, form, package, uses, dosage, price, company]
const DATA = items.map(x => [
  x.sako ?? '',
  String(x.barcode ?? '').replace(/,+$/, ''),
  x.name ?? '',
  x.nameEn ?? '',
  x.form ?? '',
  x.package ?? '',
  x.uses ?? '',
  x.dosage ?? '',
  x.price ?? '',
  x.company_name ?? '',
]);

// إزالة الحروف التالفة (U+FFFD) والتحكم غير المرئي
const clean = (v) => {
  if (typeof v !== "string") return v;
  let out = "";
  for (const ch of v) { const c = ch.codePointAt(0);
    if (c === 0xFFFD) continue;              // حرف تالف
    if (c < 0x20 && c !== 0x09) { out += " "; continue; } // تحكم
    out += ch; }
  return out.replace(/s+/g, " ").trim();
};
for (const row of DATA) for (let j = 0; j < row.length; j++) row[j] = clean(row[j]);

const dataJson = JSON.stringify(DATA);

const html = `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>كتالوج الأدوية</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />
<style>
  :root {
    --bg:#eef3f4; --panel:#ffffff; --panel-2:#f6f9fa; --ink:#0e1b22; --muted:#5a7380;
    --border:#d8e3e7; --accent:#0d9488; --accent-deep:#0f766e; --accent-soft:#d6f3ee;
    --blue:#1d4ed8; --good:#047857; --good-soft:#e7f6ee; --good-border:#b6e3c8;
    --tag:#e2f1f8; --tag-ink:#0b5a74; --shadow:0 1px 2px rgba(16,40,50,.06),0 1px 3px rgba(16,40,50,.05);
    --row-alt:#f7fafb; --row-hover:#ecfbf7; --zebra:#fbfdfd;
  }
  :root:not([data-theme="light"]) { }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg:#0a1418; --panel:#0f1f26; --panel-2:#13262e; --ink:#e4eef2; --muted:#8ba3ae;
      --border:#20363f; --accent:#2dd4bf; --accent-deep:#5eead4; --accent-soft:#113b38;
      --blue:#60a5fa; --good:#34d399; --good-soft:#0f2e26; --good-border:#1c4b3c;
      --tag:#10323f; --tag-ink:#7cc6df; --shadow:0 1px 2px rgba(0,0,0,.4);
      --row-alt:#122229; --row-hover:#123630; --zebra:#0f2127;
    }
  }
  :root[data-theme="dark"] {
    --bg:#0a1418; --panel:#0f1f26; --panel-2:#13262e; --ink:#e4eef2; --muted:#8ba3ae;
    --border:#20363f; --accent:#2dd4bf; --accent-deep:#5eead4; --accent-soft:#113b38;
    --blue:#60a5fa; --good:#34d399; --good-soft:#0f2e26; --good-border:#1c4b3c;
    --tag:#10323f; --tag-ink:#7cc6df; --shadow:0 1px 2px rgba(0,0,0,.4);
    --row-alt:#122229; --row-hover:#123630; --zebra:#0f2127;
  }

  * { box-sizing:border-box; }
  html, body { height:100%; }
  body {
    margin:0; background:var(--bg); color:var(--ink);
    font-family:"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif;
    font-feature-settings:"tnum"; height:100vh; display:flex; flex-direction:column; overflow:hidden;
  }
  h1,h2 { text-wrap:balance; }

  header { flex:none; background:var(--panel); border-bottom:1px solid var(--border);
           padding:14px 24px; display:flex; align-items:center; gap:16px; }
  .brand { display:flex; flex-direction:column; gap:2px; }
  header h1 { margin:0; font-size:19px; font-weight:700; letter-spacing:-.01em; }
  header .sub { font-size:12.5px; color:var(--muted); }
  .grow { flex:1; }
  .pill { background:var(--accent-soft); color:var(--accent-deep); font-weight:600;
          font-size:12.5px; padding:5px 12px; border-radius:999px; white-space:nowrap; }
  .icon-btn { background:var(--panel-2); border:1px solid var(--border); color:var(--ink);
              width:38px; height:38px; border-radius:10px; cursor:pointer; font-size:16px; line-height:1; }
  .icon-btn:hover { border-color:var(--accent); }

  .wrap { flex:1; min-height:0; width:100%; max-width:1240px; margin:0 auto;
          padding:16px 24px; display:flex; flex-direction:column; }

  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
           gap:12px; margin-bottom:14px; flex:none; }
  .stat { background:var(--panel); border:1px solid var(--border); border-radius:14px;
          padding:13px 16px; box-shadow:var(--shadow); }
  .stat .n { font-size:23px; font-weight:700; color:var(--accent-deep);
             font-variant-numeric:tabular-nums; }
  .stat .l { font-size:12.5px; color:var(--muted); margin-top:1px; }

  .toolbar { background:var(--panel); border:1px solid var(--border); border-radius:14px;
             padding:12px 14px; box-shadow:var(--shadow); display:flex; flex-wrap:wrap;
             gap:12px; align-items:flex-end; margin-bottom:12px; flex:none; }
  .field { display:flex; flex-direction:column; gap:5px; }
  .field label { font-size:11.5px; color:var(--muted); font-weight:600; letter-spacing:.02em; }
  input[type=search], select {
    padding:10px 12px; border:1px solid var(--border); border-radius:10px;
    background:var(--panel-2); color:var(--ink); font-size:14px; min-width:220px;
    font-family:inherit; }
  input[type=search]:focus, select:focus { outline:2px solid var(--accent); outline-offset:1px; border-color:var(--accent); }
  button { font-family:inherit; border:none; border-radius:10px; padding:10px 18px;
           font-size:14px; font-weight:600; cursor:pointer; }
  .btn-copy { background:var(--accent); color:#fff; display:inline-flex; align-items:center; gap:7px; }
  .btn-copy:hover { background:var(--accent-deep); }
  .btn-ghost { background:var(--panel-2); color:var(--ink); border:1px solid var(--border); }
  .btn-ghost:hover { border-color:var(--accent); }

  .status { color:var(--muted); font-size:13px; margin:0 2px 10px; min-height:18px; flex:none; }

  .altbar { display:none; flex:none; align-items:center; gap:12px; background:var(--good-soft);
            border:1px solid var(--good-border); color:var(--good); border-radius:12px;
            padding:10px 14px; margin-bottom:10px; font-size:13.5px; }
  .altbar b { color:var(--ink); }
  .altbar .grow { flex:1; }

  .table-wrap { background:var(--panel); border:1px solid var(--border); border-radius:14px;
                overflow:hidden; box-shadow:var(--shadow); flex:1; min-height:0;
                display:flex; flex-direction:column; }
  .scroll { overflow:auto; flex:1; min-height:0; }
  table { width:100%; border-collapse:collapse; font-size:13.5px; }
  thead th { background:var(--panel-2); color:var(--muted); font-weight:600; padding:12px 14px;
             text-align:right; white-space:nowrap; position:sticky; top:0; z-index:1;
             border-bottom:1px solid var(--border); letter-spacing:.01em; }
  tbody td { padding:11px 14px; text-align:right; border-bottom:1px solid var(--border);
             white-space:nowrap; }
  tbody tr:nth-child(even) td { background:var(--zebra); }
  tbody tr:hover td { background:var(--row-hover); }
  .price { color:var(--good); font-weight:700; font-variant-numeric:tabular-nums; }
  .en { color:var(--muted); direction:ltr; text-align:left; font-size:12.5px; }
  .company-tag { background:var(--tag); color:var(--tag-ink); padding:3px 10px; border-radius:999px; font-size:12px; }
  .alt-badge { background:var(--good-soft); color:var(--good); border:1px solid var(--good-border);
               padding:3px 11px; border-radius:999px; font-size:12px; font-weight:600; cursor:pointer; }
  .alt-badge:hover { filter:brightness(.96); }
  .alt-none { color:var(--muted); opacity:.5; }
  .more { text-align:center; padding:14px; color:var(--muted); font-size:13px; }

  .toast { position:fixed; bottom:22px; left:50%; transform:translateX(-50%) translateY(20px);
           background:var(--ink); color:var(--bg); padding:11px 20px; border-radius:10px;
           font-size:13.5px; font-weight:600; opacity:0; transition:.25s; pointer-events:none; z-index:50; }
  .toast.show { opacity:1; transform:translateX(-50%) translateY(0); }

  @media (max-width:860px) {
    header { padding:12px 16px; } .wrap { padding:12px 16px; }
    .stats { grid-template-columns:repeat(2,1fr); }
    .field { flex:1; min-width:140px; } .field input, .field select { min-width:0; width:100%; }
    .btn-copy { flex:1 1 100%; justify-content:center; }
  }
  @media (max-width:640px) {
    table, thead, tbody, tr, td { display:block; width:100%; }
    thead { display:none; }
    tbody tr { background:var(--panel) !important; border:1px solid var(--border);
               border-radius:12px; margin:10px; padding:4px 2px; }
    tbody tr:hover td { background:transparent; }
    tbody td { border:none; border-bottom:1px solid var(--border); white-space:normal;
               display:flex; justify-content:space-between; gap:12px; padding:9px 14px; }
    tbody td:last-child { border-bottom:none; }
    tbody td::before { content:attr(data-label); color:var(--muted); font-size:12px; font-weight:600; flex-shrink:0; }
    tbody td.en { text-align:left; direction:ltr; }
    tbody td:first-child { color:var(--accent-deep); font-weight:700; }
  }
  @media (prefers-reduced-motion:reduce) { .toast { transition:none; } }
</style>

<header>
  <div class="brand">
    <h1>💊 كتالوج الأدوية</h1>
    <span class="sub">قاعدة بيانات الأدوية — بحث، فلترة، وبدائل</span>
  </div>
  <div class="grow"></div>
  <span class="pill" id="pill-total">—</span>
  <button class="icon-btn" id="theme" title="تبديل المظهر">◐</button>
</header>

<div class="wrap">
  <div class="stats">
    <div class="stat"><div class="n" id="s-total">—</div><div class="l">إجمالي الأدوية</div></div>
    <div class="stat"><div class="n" id="s-shown">—</div><div class="l">نتائج الفلترة</div></div>
    <div class="stat"><div class="n" id="s-companies">—</div><div class="l">عدد الشركات</div></div>
    <div class="stat"><div class="n" id="s-alts">—</div><div class="l">تركيبات لها بدائل</div></div>
  </div>

  <div class="toolbar">
    <div class="field">
      <label>بحث</label>
      <input type="search" id="search" placeholder="الاسم / الباركود / الاسم الإنجليزي…" />
    </div>
    <div class="field">
      <label>الشركة</label>
      <select id="company"><option value="">كل الشركات</option></select>
    </div>
    <div class="grow"></div>
    <button class="btn-copy" id="copy">⧉ نسخ النتائج (CSV)</button>
  </div>

  <div class="status" id="status"></div>

  <div class="altbar" id="altbar">
    <span class="grow" id="altbar-text"></span>
    <button class="btn-ghost" id="altbar-back">⟵ رجوع لكل الأدوية</button>
  </div>

  <div class="table-wrap">
    <div class="scroll" id="scroll">
      <table>
        <thead>
          <tr>
            <th>#</th><th>الاسم</th><th>الاسم الإنجليزي</th><th>الباركود</th>
            <th>السعر</th><th>الشركة</th><th>البدائل</th><th>الاستخدام</th><th>الجرعة</th><th>التركيب</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
      <div class="more" id="more"></div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
// الأعمدة: 0 sako,1 barcode,2 name,3 nameEn,4 form,5 package,6 uses,7 dosage,8 price,9 company
const DATA = ${dataJson};
const I = { SAKO:0, BC:1, NAME:2, EN:3, FORM:4, PKG:5, USES:6, DOSE:7, PRICE:8, CO:9 };

const PAGE = 300;
let filtered = [], shown = 0, altFilter = null;
let altIndex = new Map();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const fmt = (n) => Number(n).toLocaleString('ar-EG');
const normForm = (f) => String(f ?? '').toLowerCase().replace(/\\s+/g, ' ').trim();

function buildAltIndex() {
  altIndex = new Map();
  for (const r of DATA) {
    const k = normForm(r[I.FORM]);
    if (!k) continue;
    if (!altIndex.has(k)) altIndex.set(k, []);
    altIndex.get(k).push(r);
  }
}
const altCount = (r) => {
  const k = normForm(r[I.FORM]);
  return k && altIndex.has(k) ? altIndex.get(k).length - 1 : 0;
};

function render(reset) {
  if (reset) { $('rows').innerHTML = ''; shown = 0; }
  const slice = filtered.slice(shown, shown + PAGE);
  $('rows').insertAdjacentHTML('beforeend', slice.map((r, i) => {
    const n = altCount(r);
    const alt = n > 0
      ? '<span class="alt-badge" data-form="' + esc(normForm(r[I.FORM])) + '">' + fmt(n) + ' بدائل</span>'
      : '<span class="alt-none">—</span>';
    return '<tr>'
      + '<td data-label="#">' + (shown + i + 1) + '</td>'
      + '<td data-label="الاسم">' + esc(r[I.NAME]) + '</td>'
      + '<td class="en" data-label="الاسم الإنجليزي">' + esc(r[I.EN]) + '</td>'
      + '<td data-label="الباركود">' + esc(r[I.BC]) + '</td>'
      + '<td class="price" data-label="السعر">' + esc(r[I.PRICE]) + '</td>'
      + '<td data-label="الشركة"><span class="company-tag">' + esc(r[I.CO]) + '</span></td>'
      + '<td data-label="البدائل">' + alt + '</td>'
      + '<td data-label="الاستخدام">' + esc(r[I.USES]) + '</td>'
      + '<td data-label="الجرعة">' + esc(r[I.DOSE]) + '</td>'
      + '<td class="en" data-label="التركيب">' + esc(r[I.FORM]) + '</td>'
      + '</tr>';
  }).join(''));
  shown += slice.length;
  $('more').textContent = shown < filtered.length
    ? 'عرض ' + fmt(shown) + ' من ' + fmt(filtered.length) + ' — مرّر لأسفل للمزيد'
    : (filtered.length ? 'كل النتائج (' + fmt(filtered.length) + ')' : 'لا نتائج');
}

function applyFilter() {
  if (altFilter) {
    filtered = (altIndex.get(altFilter) || []).slice()
      .sort((a, b) => (Number(a[I.PRICE])||0) - (Number(b[I.PRICE])||0));
    $('s-shown').textContent = fmt(filtered.length);
    render(true);
    return;
  }
  const q = $('search').value.trim().toLowerCase();
  const co = $('company').value;
  filtered = DATA.filter(r => {
    if (co && r[I.CO] !== co) return false;
    if (!q) return true;
    return String(r[I.NAME]||'').toLowerCase().includes(q)
        || String(r[I.EN]||'').toLowerCase().includes(q)
        || String(r[I.BC]||'').toLowerCase().includes(q);
  });
  $('s-shown').textContent = fmt(filtered.length);
  $('status').textContent = 'النتائج: ' + fmt(filtered.length) + ' من ' + fmt(DATA.length);
  render(true);
}

function showAlternatives(formKey) {
  altFilter = formKey;
  const g = altIndex.get(formKey) || [];
  $('altbar').style.display = 'flex';
  $('altbar-text').innerHTML = 'البدائل حسب التركيب: <b>' + esc(formKey) + '</b> — ' + fmt(g.length) + ' دواء (مرتّبة من الأرخص)';
  $('status').textContent = 'عرض البدائل: ' + fmt(g.length) + ' دواء بنفس التركيب';
  applyFilter();
}
function clearAlternatives() { altFilter = null; $('altbar').style.display = 'none'; applyFilter(); }

function fillCompanies() {
  const counts = {};
  for (const r of DATA) { const c = r[I.CO] || '—'; counts[c] = (counts[c]||0)+1; }
  const names = Object.keys(counts).sort((a,b)=>a.localeCompare(b,'ar'));
  $('company').innerHTML = '<option value="">كل الشركات</option>'
    + names.map(n => '<option value="' + esc(n) + '">' + esc(n) + ' (' + counts[n] + ')</option>').join('');
  $('s-companies').textContent = fmt(names.length);
}

function copyCSV() {
  const cols = [['الرمز',I.SAKO],['الباركود',I.BC],['الاسم',I.NAME],['الاسم الإنجليزي',I.EN],
    ['التركيب',I.FORM],['العبوة',I.PKG],['الاستخدام',I.USES],['الجرعة',I.DOSE],['السعر',I.PRICE],['الشركة',I.CO]];
  const cell = (v) => { const s = String(v ?? ''); return /[",\\n;]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const lines = [cols.map(c => cell(c[0])).join(',')];
  for (const r of filtered) lines.push(cols.map(c => cell(r[c[1]])).join(','));
  const text = '\\uFEFF' + lines.join('\\r\\n');
  navigator.clipboard.writeText(text).then(
    () => toast('تم نسخ ' + fmt(filtered.length) + ' صفًا — الصقها في Excel'),
    () => toast('تعذّر النسخ في هذا المتصفح')
  );
}
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

// المظهر
$('theme').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
});

$('search').addEventListener('input', () => { altFilter = null; $('altbar').style.display='none'; applyFilter(); });
$('company').addEventListener('change', () => { altFilter = null; $('altbar').style.display='none'; applyFilter(); });
$('copy').addEventListener('click', copyCSV);
$('altbar-back').addEventListener('click', clearAlternatives);
$('rows').addEventListener('click', (e) => {
  const b = e.target.closest('.alt-badge');
  if (b) showAlternatives(b.getAttribute('data-form'));
});
$('scroll').addEventListener('scroll', (e) => {
  const el = e.target;
  if (shown < filtered.length && el.scrollTop + el.clientHeight >= el.scrollHeight - 300) render(false);
});

// تشغيل
buildAltIndex();
let withAlts = 0; altIndex.forEach(v => { if (v.length > 1) withAlts++; });
$('s-total').textContent = fmt(DATA.length);
$('pill-total').textContent = fmt(DATA.length) + ' دواء';
$('s-alts').textContent = fmt(withAlts);
fillCompanies();
applyFilter();
</script>`;

const OUT = path.join(__dirname, 'artifact.html');
fs.writeFileSync(OUT, html);
console.log('تم إنشاء:', OUT);
console.log('الحجم:', (Buffer.byteLength(html) / 1048576).toFixed(2), 'ميجابايت');
