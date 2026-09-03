/** Absolute origin for links handed to humans / MCP (Payment Link alternative). */
export function getPublicAppOrigin(): string {
  const explicit = (process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const host = (process.env.WEBSITE_HOSTNAME || "").trim();
  if (host) return `https://${host.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/** Circuit-hosted Checkout.js page — not a Razorpay Payment Link. */
export function circuitPayUrl(orderId: string): string {
  return `${getPublicAppOrigin()}/pay/${encodeURIComponent(orderId)}`;
}
