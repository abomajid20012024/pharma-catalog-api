# Pharma Catalog API — خادم وسيط لكتالوج الأدوية

خادم **وسيط (middleware / proxy)** يجلب كتالوج الأدوية من المصدر، يفكّ ضغط gzip،
يخزّنه مؤقتًا في الذاكرة، ويقدّمه عبر نقاط نهاية **REST JSON نظيفة** لأي مشروع ثالث —
مع بحث، فلترة حسب الشركة، وإيجاد البدائل حسب التركيب.

- **بدون أي اعتماديات** — وحدات Node المدمجة فقط (`http`, `https`, `zlib`).
- **CORS مفعّل** (`Access-Control-Allow-Origin: *`) للاستهلاك من المتصفح.
- **تخزين مؤقت** افتراضيًا 30 دقيقة، مع إعادة جلب يدوية عبر `/api/refresh`.

## التشغيل

```bash
npm start            # أو: node server.js
# http://localhost:3000
```

متغيّرات البيئة (اختيارية):

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `3000` | منفذ الخادم |
| `UPSTREAM_URL` | مصدر الصيدلية | رابط المصدر (`POST … {state:"empty"}`) |
| `CACHE_TTL_MS` | `1800000` | مدة التخزين المؤقت بالميلي ثانية |

## نقاط النهاية

| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/health` | فحص الحالة وعمر الكاش |
| GET | `/api` | فهرس نقاط النهاية |
| GET | `/api/stats` | إحصائيات: الإجمالي، الشركات، التركيبات، البدائل |
| GET | `/api/companies` | قائمة الشركات مع عدد أدوية كل شركة |
| GET | `/api/products` | قائمة المنتجات (مع فلترة وتصفّح) |
| GET | `/api/products/:barcode` | منتج واحد بالباركود |
| GET | `/api/alternatives/:barcode` | بدائل الدواء (نفس التركيب) مرتّبة من الأرخص |
| GET | `/api/refresh` | إعادة جلب البيانات من المصدر فورًا |

### `/api/products` — بارامترات الاستعلام

| البارامتر | مثال | الوصف |
|---|---|---|
| `q` | `?q=باراسيتامول` | بحث في الاسم/الإنجليزي/الباركود |
| `company` | `?company=الفا` | فلترة حسب الشركة |
| `barcode` | `?barcode=6219567080101` | مطابقة باركود |
| `limit` | `?limit=50` | الحد الأقصى (افتراضي 100، أقصى 1000) |
| `offset` | `?offset=100` | التصفّح |
| `all` | `?all=true` | إرجاع كل النتائج بلا تصفّح |

### أمثلة

```bash
# إحصائيات
curl http://localhost:3000/api/stats

# بحث عن دواء
curl "http://localhost:3000/api/products?q=غريبامول&limit=5"

# منتج بالباركود
curl http://localhost:3000/api/products/6219567080101

# البدائل (مرتّبة من الأرخص)
curl http://localhost:3000/api/alternatives/6219567080101
```

### شكل المنتج

```json
{
  "sako": "9809",
  "barcode": "6219567080101",
  "name": "غريبامول 20 مضغوطة",
  "nameEn": "GRIPPAMOL TAB.",
  "form": "caffeine 25mg+chlorpheniramine 2.5mg+paracetamol 350mg+vitC 150mg / tab",
  "package": "FOR /20/TAB.BLISTER",
  "uses": "علاج اعراض الرشح والانفلونزا",
  "dosage": "1-3 يوميا",
  "price": 75,
  "company": "ميديوتيك",
  "fact": 2,
  "updated_at": "2026-08-27T10:52:09.207Z"
}
```

## الاستهلاك من مشروع ثالث (JavaScript)

```js
const res = await fetch('https://<your-host>/api/alternatives/6219567080101');
const { product, alternatives } = await res.json();
```

## أدوات مساعدة

```bash
npm run build:xlsx      # توليد ملف Excel كامل بكل الأدوية
npm run build:artifact  # توليد صفحة HTML مستقلة ببيانات مضمّنة
```

## النشر

يعمل على أي منصة تدعم Node ≥ 18. يوجد `Procfile` للنشر على Heroku/Railway.
الخادم يحمّل البيانات مسبقًا عند الإقلاع.

## ملاحظات

- الصفحة التجريبية متاحة على `/` (واجهة بحث/فلترة/بدائل).
- قيم `barcode` من المصدر تحوي فاصلة لاحقة — تُزال تلقائيًا هنا.
- البيانات مملوكة لمصدرها؛ هذا الخادم وسيط تقنّي فقط.
