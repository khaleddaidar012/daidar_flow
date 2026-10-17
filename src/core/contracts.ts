import { z } from "zod";
const id = z.string().uuid();
const integer = z.number().int().min(0).max(1_000_000_000);
const qty = integer.min(1);
const password = z.string().min(10).max(128);
export const payment = z
  .object({ method: z.enum(["cash", "card", "other"]), amount: integer.min(1) })
  .strict();
const item = z
  .object({
    productId: id,
    quantity: qty,
    unit: z.enum(["base", "pack"]),
    price: integer,
  })
  .strict();
export const schemas = {
  notices: z.object({}).strict(),
  onboardingMove: z
    .object({
      step: z.number().int().min(0).max(3),
      expectedStep: z.number().int().min(0).max(3),
      managerOnly: z.boolean().default(false),
    })
    .strict(),
  onboardingComplete: z.object({}).strict(),
  bootstrap: z.object({}).strict(),
  activateStart: z.object({}).strict(),
  activatePoll: z.object({}).strict(),
  licenseImport: z.object({}).strict(),
  licenseRefresh: z.object({}).strict(),
  setup: z
    .object({
      username: z.string().min(3).max(60),
      password,
      business: z.string().min(1).max(100),
    })
    .strict(),
  login: z
    .object({ username: z.string().max(60), password: z.string().max(128) })
    .strict(),
  logout: z.object({}).strict(),
  password: z
    .object({ oldPassword: z.string().max(128), newPassword: password })
    .strict(),
  userCreate: z
    .object({
      username: z.string().min(3).max(60),
      password,
      role: z.enum(["manager", "cashier", "stock"]),
    })
    .strict(),
  userReset: z
    .object({ userId: id, password, managerPassword: z.string().max(128) })
    .strict(),
  productQuick: z
    .object({
      operationId: id,
      name: z.string().trim().min(1).max(160),
      retail: integer,
      openingQuantity: integer,
      barcode: z.string().trim().max(80).default(""),
      category: z.string().max(80).default(""),
      baseUnit: z.string().min(1).max(20).default("قطعة"),
      packName: z.string().min(1).max(20).default("كرتونة"),
      packFactor: qty.default(12000),
      purchase: integer.default(0),
      wholesale: integer.optional(),
    })
    .strict(),
  productCreate: z
    .object({
      name: z.string().min(1).max(160),
      barcode: z.string().min(1).max(80),
      category: z.string().max(80),
      baseUnit: z.string().min(1).max(20),
      packName: z.string().min(1).max(20),
      packFactor: qty,
      retail: integer,
      wholesale: integer,
      purchase: integer,
      reorder: integer,
    })
    .strict(),
  productExport: z.object({}).strict(),
  productUpdate: z
    .object({
      id,
      barcode: z.string().trim().min(1).max(80).optional(),
      name: z.string().min(1).max(160),
      category: z.string().max(80),
      retail: integer,
      wholesale: integer,
      purchase: integer,
      reorder: integer,
    })
    .strict(),
  partyCreate: z
    .object({
      name: z.string().min(1).max(160),
      kind: z.enum(["customer", "supplier"]),
      opening: z.number().int().min(-1_000_000_000).max(1_000_000_000),
      reason: z.string().min(3).max(200),
      creditLimit: integer,
    })
    .strict(),
  purchase: z
    .object({
      operationId: id,
      partyId: id.optional(),
      lines: z
        .array(item.extend({ totalCost: integer.optional() }).strict())
        .min(1)
        .max(100),
      payments: z.array(payment).max(10),
    })
    .strict(),
  sale: z
    .object({
      operationId: id,
      partyId: id.optional(),
      lines: z.array(item).min(1).max(100),
      discount: integer,
      payments: z.array(payment).max(10),
    })
    .strict(),
  return: z
    .object({
      operationId: id,
      documentId: id,
      lines: z
        .array(z.object({ lineId: id, quantity: qty }).strict())
        .min(1)
        .max(100),
      method: z.enum(["cash", "card", "other", "credit"]),
      reason: z.string().min(3).max(200),
    })
    .strict(),
  shiftOpen: z.object({ operationId: id, float: integer }).strict(),
  shiftClose: z
    .object({ operationId: id, actual: integer, reason: z.string().max(200) })
    .strict(),
  cash: z
    .object({
      operationId: id,
      kind: z.enum(["deposit", "withdrawal", "expense"]),
      amount: integer.min(1),
      reason: z.string().min(3).max(200),
    })
    .strict(),
  adjust: z
    .object({
      operationId: id,
      productId: id,
      counted: integer,
      reason: z.string().min(3).max(200),
    })
    .strict(),
  partyPay: z
    .object({
      operationId: id,
      partyId: id,
      amount: integer.min(1),
      method: z.enum(["cash", "card", "other"]),
      reason: z.string().min(3).max(200),
    })
    .strict(),
  hold: z
    .object({
      operationId: id,
      label: z.string().min(1).max(100),
      cart: z
        .object({
          lines: z.array(item).max(100),
          discount: integer,
          partyId: id.optional(),
        })
        .strict(),
    })
    .strict(),
  holdDelete: z.object({ id }).strict(),
  snapshot: z.object({}).strict(),
  report: z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  backup: z.object({}).strict(),
  restore: z
    .object({
      managerPassword: z.string().max(128),
      reason: z.string().min(3).max(200),
    })
    .strict(),
  export: z.object({}).strict(),
  print: z.object({ documentId: id, reason: z.string().max(200) }).strict(),
  companyLink: z.object({ name: z.enum(["website", "facebook"]) }).strict(),
  importPreview: z.object({}).strict(),
  importCommit: z.object({}).strict(),
};
export type Command = keyof typeof schemas;
export const modules = [
  {
    id: "general",
    configuration: { schemaVersion: 1, scope: "business" },
    implemented: true,
    dependencies: [],
    permissions: ["sale", "purchase", "inventory"],
  },
  {
    id: "supermarket",
    configuration: { schemaVersion: 1, scope: "business" },
    implemented: false,
    dependencies: ["general"],
    permissions: ["batch", "expiry"],
  },
  {
    id: "restaurant",
    configuration: { schemaVersion: 1, scope: "business" },
    implemented: false,
    dependencies: ["general"],
    permissions: ["kitchen", "tables"],
  },
  {
    id: "fashion",
    configuration: { schemaVersion: 1, scope: "business" },
    implemented: false,
    dependencies: ["general"],
    permissions: ["variants"],
  },
  {
    id: "appliances",
    configuration: { schemaVersion: 1, scope: "business" },
    implemented: false,
    dependencies: ["general"],
    permissions: ["serial", "warranty"],
  },
];
export const company = {
  website: "https://daidarsoluations.com",
  facebook: "https://www.facebook.com/daidarsoluations",
};
