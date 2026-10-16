import { z } from "zod";
import type { Envelope } from "./license";
export class HubConnector {
  private pending?: {
    code: string;
    expires: number;
    next: number;
    interval: number;
  };
  constructor(
    private base: string,
    private device: string,
    private development = false,
  ) {
    const u = new URL(base);
    if (
      u.protocol !== "https:" &&
      !(development && u.origin === "http://127.0.0.1:47831")
    )
      throw new Error("عنوان هب غير آمن");
  }
  async request(path: string, body: unknown) {
    const r = await fetch(new URL(path, this.base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const p = await r.json();
    if (!r.ok) throw new Error("تعذر الاتصال بهب: " + r.status);
    return p;
  }
  async start() {
    const p = z
      .object({
        device_code: z.string(),
        verification_uri_complete: z.string().url(),
        interval: z.number().int().min(1).max(60),
        expires_in: z.number().int().positive(),
      })
      .parse(
        await this.request("/v1/device/authorize", {
          product: "daidar-flow",
          installation_id: this.device,
        }),
      );
    if (
      new URL(p.verification_uri_complete).origin !== new URL(this.base).origin
    )
      throw new Error("رابط تفعيل خارج هب");
    this.pending = {
      code: p.device_code,
      expires: Date.now() + p.expires_in * 1000,
      next: 0,
      interval: p.interval * 1000,
    };
    return p;
  }
  async poll() {
    if (!this.pending || Date.now() > this.pending.expires)
      throw new Error("انتهى رمز التفعيل");
    if (Date.now() < this.pending.next) return { status: "pending" } as const;
    this.pending.next = Date.now() + this.pending.interval;
    const r = z
      .discriminatedUnion("status", [
        z.object({ status: z.literal("pending") }),
        z.object({
          status: z.literal("approved"),
          license: z.object({ payload: z.string(), signature: z.string() }),
        }),
      ])
      .parse(
        await this.request("/v1/device/token", {
          device_code: this.pending.code,
          installation_id: this.device,
        }),
      );
    if (r.status === "approved") this.pending = undefined;
    return r;
  }
  async renew(envelope: Envelope) {
    return this.request("/v1/license/refresh", {
      installation_id: this.device,
      license: envelope,
    });
  }
}
