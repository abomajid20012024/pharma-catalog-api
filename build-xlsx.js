// يجلب كامل كتالوج الأدوية ويكتبه في ملف xlsx حقيقي — بوحدات Node المدمجة فقط.
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const UPSTREAM = 'https://arabmix.herokuapp.com/pharma/v2/products/sync';
const OUT = path.join(__dirname, 'الأدوية_الكامل.xlsx');

// ---------- جلب الكتالوج ----------
function fetchCatalog() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ state: 'empty' });
    const u = new URL(UPSTREAM);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const gz = /gzip/i.test((res.headers['content-type']||'') + (res.headers['content-encoding']||''));
        const raw = gz ? zlib.gunzipSync(buf) : buf;
        try { resolve(JSON.parse(raw.toString('utf8'))); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ---------- أدوات XLSX ----------
const xmlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' }[c]));

function colLetter(n) { // 0 -> A
  let s = '';
  n += 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// خلية: نص (inlineStr) أو رقم
function cell(ref, value, numeric) {
  if (numeric && value !== '' && value != null && isFinite(value))
    return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
}

// ---------- ZIP (بوحدة zlib) ----------
function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zip(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(e.data);
    const comp = zlib.deflateRawSync(data, { level: 6 });
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            // version needed
    lh.writeUInt16LE(0x0800, 6);        // UTF-8 flag
    lh.writeUInt16LE(8, 8);             // method: deflate
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12); // time/date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const localBuf = Buffer.concat(locals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// ---------- البناء ----------
(async () => {
  console.log('جارٍ جلب الكتالوج…');
  const d = await fetchCatalog();
  const items = d.items || [];
  console.log(`عدد الأدوية: ${items.length}`);

  // الأعمدة: [العنوان، المفتاح، رقمي؟]
  const cols = [
    ['م', (_, i) => i + 1, true],
    ['الرمز (sako)', r => r.sako, false],
    ['الباركود', r => String(r.barcode ?? '').replace(/,+$/, ''), false],
    ['الاسم', r => r.name, false],
    ['الاسم الإنجليزي', r => r.nameEn, false],
    ['التركيب', r => r.form, false],
    ['العبوة', r => r.package, false],
    ['الاستخدام', r => r.uses, false],
    ['الجرعة', r => r.dosage, false],
    ['السعر', r => (r.price === '' || r.price == null ? '' : Number(r.price)), true],
    ['المعمل (fact)', r => r.fact, true],
    ['الشركة', r => r.company_name, false],
    ['آخر تحديث', r => String(r.updated_at_utc ?? '').replace('T', ' ').replace(/\..*/, ''), false],
  ];
  const lastCol = colLetter(cols.length - 1);

  let rows = '';
  // رأس الجدول
  rows += `<row r="1">` + cols.map((c, j) => cell(colLetter(j) + '1', c[0], false)).join('') + `</row>`;
  // البيانات
  for (let i = 0; i < items.length; i++) {
    const r = items[i], rn = i + 2;
    let cells = '';
    for (let j = 0; j < cols.length; j++) {
      const [, fn, num] = cols[j];
      cells += cell(colLetter(j) + rn, fn(r, i), num);
    }
    rows += `<row r="${rn}">${cells}</row>`;
  }

  const sheet =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView rightToLeft="1" tabSelected="1" workbookViewId="0">
<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetData>${rows}</sheetData>
<autoFilter ref="A1:${lastCol}${items.length + 1}"/>
</worksheet>`;

  const contentTypes =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rels =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="الأدوية" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const wbRels =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const buf = zip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
  ]);

  fs.writeFileSync(OUT, buf);
  console.log(`تم إنشاء الملف: ${OUT}`);
  console.log(`الحجم: ${(buf.length / 1024 / 1024).toFixed(2)} ميجابايت`);
})().catch(e => { console.error('خطأ:', e.message); process.exit(1); });
