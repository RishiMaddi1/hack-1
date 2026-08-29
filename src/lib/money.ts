export function formatInr(amountPaise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amountPaise / 100);
}

export function clampPaise(value: number): number {
  return Math.max(0, Math.round(value));
}
