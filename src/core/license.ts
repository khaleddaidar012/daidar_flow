import { verify, createHash } from "node:crypto";
import { z } from "zod";
const claimsSchema = z
  .object({
    kid: z.string().min(1),
    version: z.number().int().positive(),
    product: z.literal("daidar-flow"),
    subscription: z.string().min(1),
    business: z.string().min(1),
    device: z.string().uuid(),
    modules: z.array(z.string()),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    offlineUntil: z.string().datetime(),
    graceSeconds: z.number().int().min(0).max(604800),
  })
  .strict();
export type Claims = z.infer<typeof claimsSchema>;
export type Envelope = { payload: string; signature: string };
export interface SecureState {
  load(): { license?: Envelope; lastTime?: number };
  save(state: { license?: Envelope; lastTime?: number }): void;
}
export class License {
  claims?: Claims;
  envelope?: Envelope;
  lastTime = 0;
  clockWarning = false;
  private tick = performance.now();
  constructor(
    public device: string,
    private keys: Record<string, string>,
    private state: SecureState,
    private now = () => Date.now(),
  ) {
    const saved = state.load();
    this.lastTime = saved.lastTime || 0;
    if (saved.license) {
      this.accept(saved.license, false);
    }
  }
  accept(input: unknown, save = true) {
    const env = z
      .object({
        payload: z.string().max(16384),
        signature: z.string().max(1024),
      })
      .strict()
      .parse(input);
    const bytes = Buffer.from(env.payload, "base64url");
    const claims = claimsSchema.parse(JSON.parse(bytes.toString("utf8")));
    const key = this.keys[claims.kid];
    if (
      !key ||
      !verify(null, bytes, key, Buffer.from(env.signature, "base64url"))
    )
      throw new Error("توقيع الرخصة غير صالح");
    if (claims.device !== this.device) throw new Error("الرخصة تخص جهازًا آخر");
    if (!claims.modules.includes("general"))
      throw new Error("وحدة المتجر غير مرخصة");
    if (
      Date.parse(claims.expiresAt) < Date.parse(claims.issuedAt) ||
      Date.parse(claims.offlineUntil) < Date.parse(claims.issuedAt)
    )
      throw new Error("تواريخ الرخصة غير صالحة");
    if (
      this.claims &&
      (claims.subscription !== this.claims.subscription ||
        claims.business !== this.claims.business ||
        claims.version < this.claims.version)
    )
      throw new Error("رخصة قديمة أو اشتراك مختلف");
    if (
      this.claims?.version === claims.version &&
      createHash("sha256").update(env.payload).digest("hex") !==
        createHash("sha256").update(this.envelope!.payload).digest("hex")
    )
      throw new Error("نسخة الرخصة متعارضة");
    this.claims = claims;
    this.envelope = env;
    this.lastTime = Math.max(this.lastTime, Date.parse(claims.issuedAt));
    if (save) this.persist();
    return this.status();
  }
  time() {
    const n = this.now();
    this.clockWarning = n + 300000 < this.lastTime;
    const tick = performance.now();
    this.lastTime = Math.max(n, this.lastTime + Math.max(0, tick - this.tick));
    this.tick = tick;
    return Math.floor(this.lastTime);
  }
  persist() {
    this.state.save({ license: this.envelope, lastTime: this.lastTime });
  }
  status() {
    const time = this.time();
    const c = this.claims;
    const until = c
      ? Math.min(
          Date.parse(c.expiresAt) + c.graceSeconds * 1000,
          Date.parse(c.offlineUntil),
        )
      : 0;
    return {
      claims: c,
      active: !!c && time < until,
      remaining: Math.max(0, until - time),
      clockWarning: this.clockWarning,
      device: this.device,
    };
  }
  require(module = "general") {
    const s = this.status();
    if (!s.active)
      throw new Error(
        "انتهت الرخصة أو مهلة العمل دون اتصال. القراءة والنسخ متاحان.",
      );
    if (!this.claims?.modules.includes(module))
      throw new Error("الوحدة غير مرخصة");
    this.persist();
  }
}
