/**
 * Pharma Catalog API — خادم وسيط (middleware)
 * يجلب كتالوج الأدوية من المصدر، يفكّ ضغط gzip، يخزّنه مؤقتًا،
 * ويقدّمه كـ JSON نظيف عبر نقاط نهاية REST لأي مشروع ثالث.
 *
 * بوحدات Node المدمجة فقط — بدون أي اعتماديات.
 */

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const UPSTREAM = process.env.UPSTREAM_URL
  || 'https://arabmix.herokuapp.com/pharma/v2/products/sync';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 30 * 60 * 1000); // 30 دقيقة

// ---------------------------------------------------------------- أدوات
// تنظيف النصوص من الحروف التالفة ورموز التحكم
function clean(v) {
  if (typeof v !== 'string') return v;
  let out = '';
  for (const ch of v) {
    const c = ch.codePointAt(0);
    if (c === 0xFFFD) continue;
    if (c < 0x20 && c !== 0x09) { out += ' '; continue; }
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

const normForm = (f) => String(f ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------ جلب المصدر
function fetchUpstream() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ state: 'empty' });
    const u = new URL(UPSTREAM);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const buf = Buffer.concat(chunks);
          const gz = /gzip/i.test((res.headers['content-type'] || '') + (res.headers['content-encoding'] || ''));
          const raw = gz ? zlib.gunzipSync(buf) : buf;
          resolve(JSON.parse(raw.toString('utf8')));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ------------------------------------------------------------ التخزين المؤقت
const cache = {
  items: null,          // المنتجات المعالَجة
  byBarcode: new Map(), // باركود -> منتج
  altIndex: new Map(),  // تركيب مطبّع -> منتجات
  meta: null,           // {total, generated_at_utc, next_sync_utc}
  fetchedAt: 0,
  loading: null,
};

function processSnapshot(snap) {
  const items = (snap.items || []).map((x) => ({
    sako: clean(x.sako),
    barcode: clean(String(x.barcode ?? '').replace(/,+$/, '')),
    name: clean(x.name),
    nameEn: clean(x.nameEn),
    form: clean(x.form),
    package: clean(x.package),
    uses: clean(x.uses),
    dosage: clean(x.dosage),
    price: x.price === '' || x.price == null ? null : Number(x.price),
    company: clean(x.company_name),
    fact: x.fact ?? null,
    updated_at: x.updated_at_utc || null,
  }));

  const byBarcode = new Map();
  const altIndex = new Map();
  for (const it of items) {
    if (it.barcode) byBarcode.set(it.barcode, it);
    const k = normForm(it.form);
    if (!k) continue;
    if (!altIndex.has(k)) altIndex.set(k, []);
    altIndex.get(k).push(it);
  }

  cache.items = items;
  cache.byBarcode = byBarcode;
  cache.altIndex = altIndex;
  cache.meta = {
    total: items.length,
    generated_at_utc: snap.generated_at_utc || null,
    next_sync_utc: snap.next_sync_utc || null,
  };
  cache.fetchedAt = Date.now();
}

// يضمن وجود بيانات حديثة (يعيد الجلب عند انتهاء المدة)
async function ensureData(force = false) {
  const stale = !cache.items || (Date.now() - cache.fetchedAt > CACHE_TTL_MS);
  if (!force && !stale) return;
  if (cache.loading) return cache.loading; // منع الجلب المتزامن المتكرر
  cache.loading = (async () => {
    const snap = await fetchUpstream();
    processSnapshot(snap);
  })();
  try { await cache.loading; } finally { cache.loading = null; }
}

// --------------------------------------------------------------- الاستجابات
function sendJSON(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=60',
  });
  res.end(payload);
}

function matchAlternatives(barcode) {
  const prod = cache.byBarcode.get(barcode);
  if (!prod) return null;
  const k = normForm(prod.form);
  const group = (k && cache.altIndex.get(k)) || [prod];
  const alternatives = group
    .filter((p) => p.barcode !== barcode)
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return { product: prod, composition: prod.form, count: alternatives.length, alternatives };
}

// ---------------------------------------------------------------- التوجيه
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname.replace(/\/+$/, '') || '/';
  const qp = u.searchParams;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  if (req.method !== 'GET') return sendJSON(res, 405, { ok: false, error: 'method_not_allowed' });

  try {
    // الصفحة التجريبية
    if (p === '/') {
      const f = path.join(__dirname, 'index.html');
      if (fs.existsSync(f)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(f));
      }
      return sendJSON(res, 200, { ok: true, service: 'pharma-catalog-api', docs: '/api' });
    }

    // فهرس الـ API
    if (p === '/api') {
      return sendJSON(res, 200, {
        ok: true,
        service: 'pharma-catalog-api',
        endpoints: {
          'GET /health': 'فحص الحالة',
          'GET /api/stats': 'إحصائيات عامة',
          'GET /api/companies': 'قائمة الشركات مع العدد',
          'GET /api/products': 'المنتجات (q, company, barcode, limit, offset, all)',
          'GET /api/products/:barcode': 'منتج واحد بالباركود',
          'GET /api/alternatives/:barcode': 'بدائل الدواء (نفس التركيب) مرتّبة من الأرخص',
          'GET /api/refresh': 'إعادة جلب البيانات من المصدر فورًا',
        },
      });
    }

    if (p === '/health') {
      return sendJSON(res, 200, {
        ok: true,
        cached: !!cache.items,
        cached_items: cache.items ? cache.items.length : 0,
        cache_age_sec: cache.fetchedAt ? Math.round((Date.now() - cache.fetchedAt) / 1000) : null,
      });
    }

    if (p === '/api/refresh') {
      await ensureData(true);
      return sendJSON(res, 200, { ok: true, refreshed: true, ...cache.meta });
    }

    // كل ما يلي يحتاج بيانات
    await ensureData();

    if (p === '/api/stats') {
      return sendJSON(res, 200, {
        ok: true,
        total: cache.meta.total,
        companies: new Set(cache.items.map((x) => x.company || '—')).size,
        compositions: cache.altIndex.size,
        compositions_with_alternatives: [...cache.altIndex.values()].filter((v) => v.length > 1).length,
        source_generated_at_utc: cache.meta.generated_at_utc,
        cached_at: new Date(cache.fetchedAt).toISOString(),
      });
    }

    if (p === '/api/companies') {
      const counts = {};
      for (const x of cache.items) { const c = x.company || '—'; counts[c] = (counts[c] || 0) + 1; }
      const companies = Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      return sendJSON(res, 200, { ok: true, total: companies.length, companies });
    }

    // منتج واحد بالباركود: /api/products/:barcode  أو  /api/alternatives/:barcode
    const prodMatch = p.match(/^\/api\/products\/(.+)$/);
    if (prodMatch) {
      const bc = decodeURIComponent(prodMatch[1]).replace(/,+$/, '');
      const prod = cache.byBarcode.get(bc);
      if (!prod) return sendJSON(res, 404, { ok: false, error: 'not_found', barcode: bc });
      return sendJSON(res, 200, { ok: true, product: prod });
    }

    const altMatch = p.match(/^\/api\/alternatives\/(.+)$/);
    if (altMatch) {
      const bc = decodeURIComponent(altMatch[1]).replace(/,+$/, '');
      const r = matchAlternatives(bc);
      if (!r) return sendJSON(res, 404, { ok: false, error: 'not_found', barcode: bc });
      return sendJSON(res, 200, { ok: true, ...r });
    }

    // قائمة المنتجات مع الفلترة والتصفّح
    if (p === '/api/products') {
      const q = (qp.get('q') || '').trim().toLowerCase();
      const company = qp.get('company');
      const barcode = qp.get('barcode');
      const all = qp.get('all') === 'true' || qp.get('all') === '1';
      let limit = Math.min(Number(qp.get('limit')) || 100, 1000);
      const offset = Number(qp.get('offset')) || 0;

      let list = cache.items;
      if (barcode) list = list.filter((x) => x.barcode === barcode.replace(/,+$/, ''));
      if (company) list = list.filter((x) => x.company === company);
      if (q) list = list.filter((x) =>
        String(x.name || '').toLowerCase().includes(q) ||
        String(x.nameEn || '').toLowerCase().includes(q) ||
        String(x.barcode || '').toLowerCase().includes(q));

      const total = list.length;
      const items = all ? list : list.slice(offset, offset + limit);
      return sendJSON(res, 200, {
        ok: true, total, count: items.length,
        offset: all ? 0 : offset, limit: all ? total : limit, items,
      });
    }

    return sendJSON(res, 404, { ok: false, error: 'route_not_found', path: p });
  } catch (e) {
    return sendJSON(res, 502, { ok: false, error: 'upstream_error', message: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`Pharma Catalog API يعمل على: http://localhost:${PORT}`);
  console.log(`فهرس الـ API: http://localhost:${PORT}/api`);
  // تحميل مسبق للبيانات
  ensureData().then(
    () => console.log(`تم تحميل ${cache.meta.total} دواء في الذاكرة.`),
    (e) => console.error('فشل التحميل المسبق:', e.message)
  );
});
