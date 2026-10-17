# دعيدر فلو | Daidar Flow
**شغلك كله… في مسار واحد** — منتج دعيدر هب.
إصدار0.3.0 تجريبي Windows لمتجر عام؛ ليست شهادة جاهزية للبيع.

```powershell
npm ci
npm run typecheck
npm test
npm run dev:hub
# في طرفية أخرى:
$env:DAIDAR_DEV_HUB='1'
npm start
```

React/TypeScript وElectron sandbox معSQLite في العملية الرئيسية. البيانات خارج التثبيت. معاملات ذرية وأسعار/تكلفة snapshot وArgon2id وEd25519 ونسخ SQLite متسق. قوالب نشاط أخرى مسجلة وغير منفذة.

- [خطة التنفيذ](docs/PLAN.md)
- [السياسات والمواصفات](docs/SPEC.md)
- [نموذج البيانات](docs/DATA-MODEL.md)
- [دليل التشغيل وأول عميل](docs/OPERATIONS.md)
- [عقد دعيدر هب](docs/HUB-OPENAPI.yaml)
- [الرخص والأمن](docs/SECURITY-LICENSING.md)
- [الاختبارات وحدود التسليم](docs/ACCEPTANCE.md)
- [إشعارات المكونات](docs/THIRD-PARTY-NOTICES.md)

npm run package:pilot يبني NSIS للتجربة معالمحاكي المحلي ومفتاح تحقق عام فقط.
npm run package:win يبني الإنتاج بعد إدخال URL هب ومفاتيح التحقق العامة في بيئة البناء.
المثبت غير موقّع عند عدم وجود شهادة. ملفاتrelease خارجGit.
حقوق الكود الأصلي للدعيدر؛ حقوق التبعيات محفوظة. الشعار من أصول شركة دعيدر التي حددها المالك.

تحديث 0.3.0: [معالج إعداد أول تشغيل](docs/RELEASE-0.3.0.md)، مع [شاشة الموردين](docs/screenshots/setup-suppliers-0.3.0.png) و[شاشة الاستعداد](docs/screenshots/setup-ready-0.3.0.png).
