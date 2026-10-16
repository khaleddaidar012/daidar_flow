export function decimal(text: string, places = 2): number {
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("قيمة رقمية غير صالحة");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > places)
    throw new Error("عدد المنازل العشرية أكبر من المسموح");
  const n =
    BigInt(whole) * 10n ** BigInt(places) +
    BigInt(fraction.padEnd(places, "0") || "0");
  if (n > 1_000_000_000_000n) throw new Error("القيمة أكبر من الحد");
  return Number(n);
}
export function ratio(
  value: number,
  numerator: number,
  denominator: number,
): number {
  if (
    ![value, numerator, denominator].every(Number.isSafeInteger) ||
    denominator <= 0
  )
    throw new Error("حساب غير صالح");
  const n = BigInt(value) * BigInt(numerator),
    d = BigInt(denominator);
  const result = (n + d / 2n) / d;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("تجاوز الدقة");
  return Number(result);
}
