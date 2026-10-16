# نموذج البيانات
users: hash/role/mustChange/attempts/lockedUntil. products: barcode/category/base/package/prices/reorder/quantity/value.
parties: customer/supplier/opening/creditLimit. documents: sale/purchase/sale-return/purchase-return/parent/actor/party/shift/time/totals.
lines: quantity/unitPrice/net/cost snapshot. movements: quantity/value/reason/reference.
payments: method/amount/document/party/shift. shifts: float/actual/expected/difference/reason.
cash_events: deposit/withdrawal/expense. audit: actor/action/subject/time دون أسرار.
operations: UUID وفingerprint/result لمنع تكرار المعاملة. scopes منشأة/فرع/مخزن/جهاز مبدئية.
foreign_keys وCHECK وWAL وBEGIN IMMEDIATE. user_version=2؛ رفض مخطط أحدث. نسخة متسقة قبل migration1→2 وما يليها. بيانات العميل خارج install directory.
