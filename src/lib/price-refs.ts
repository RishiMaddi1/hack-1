import { getProduct } from "./catalog";
import { getCart, getMandateForSession } from "./cart";
import { formatInr } from "./money";
import { priceCart } from "./quote";

/** Tokens the agent may emit; values always resolve from catalog / session store. */
export const PRICE_TOKEN_HELP =
  "Never write ₹ digits yourself. Only emit these tokens exactly: {{p:SKU}} {{line:SKU}} {{cart.payable}} {{cart.subtotal}} {{mandate.remaining}} {{mandate.max}}. Server fills amounts from storage.";

export function pRef(sku: string): string {
  return `{{p:${sku}}}`;
}

export function lineRef(sku: string): string {
  return `{{line:${sku}}}`;
}

export function cartPayableRef(): string {
  return "{{cart.payable}}";
}

export function cartSubtotalRef(): string {
  return "{{cart.subtotal}}";
}

export function mandateRemainingRef(): string {
  return "{{mandate.remaining}}";
}

export function mandateMaxRef(): string {
  return "{{mandate.max}}";
}

export function resolvePriceTokens(text: string, sessionId: string): string {
  const mandate = getMandateForSession(sessionId);
  const priced = priceCart(getCart(sessionId));
  const cartBySku = new Map(priced.lines.map((l) => [l.sku, l]));

  return text
    .replace(/\{\{p:([^}]+)\}\}/gi, (_, raw: string) => {
      const product = getProduct(raw.trim());
      return product ? formatInr(product.pricePaise) : "[unknown SKU]";
    })
    .replace(/\{\{line:([^}]+)\}\}/gi, (_, raw: string) => {
      const line = cartBySku.get(raw.trim());
      return line ? formatInr(line.linePaise) : "[not in cart]";
    })
    .replace(/\{\{cart\.payable\}\}/gi, () => formatInr(priced.payablePaise))
    .replace(/\{\{cart\.subtotal\}\}/gi, () => formatInr(priced.subtotalPaise))
    .replace(/\{\{mandate\.remaining\}\}/gi, () => formatInr(mandate.remainingPaise))
    .replace(/\{\{mandate\.max\}\}/gi, () => formatInr(mandate.maxPaise));
}

/** Allowed paise values the agent may truthfully mention for this turn. */
export function allowedPaiseForTurn(sessionId: string, hintedSkus: string[]): Set<number> {
  const allowed = new Set<number>();
  for (const sku of hintedSkus) {
    const product = getProduct(sku);
    if (product) allowed.add(product.pricePaise);
  }
  const priced = priceCart(getCart(sessionId));
  for (const line of priced.lines) {
    allowed.add(line.unitPaise);
    allowed.add(line.linePaise);
  }
  allowed.add(priced.payablePaise);
  allowed.add(priced.subtotalPaise);
  if (priced.discountPaise) allowed.add(priced.discountPaise);
  const mandate = getMandateForSession(sessionId);
  allowed.add(mandate.remainingPaise);
  allowed.add(mandate.maxPaise);
  return allowed;
}

function mentionToPaise(raw: string): number | null {
  const digits = raw.replace(/[₹Rs.\s,]/gi, "");
  if (!digits) return null;
  const rupees = Number(digits);
  if (!Number.isFinite(rupees)) return null;
  return Math.round(rupees * 100);
}

/**
 * After token resolve: any leftover ₹ amounts not in the store-backed allow-set
 * are stripped so a hallucinated "₹5,990" cannot reach the buyer.
 */
export function scrubInventedMoney(
  text: string,
  allowedPaise: Set<number>,
): { text: string; scrubbed: boolean } {
  let scrubbed = false;
  const next = text.replace(/₹\s*[\d,]+(?:\.\d+)?|Rs\.?\s*[\d,]+(?:\.\d+)?/gi, (match) => {
    const paise = mentionToPaise(match);
    if (paise != null && allowedPaise.has(paise)) return formatInr(paise);
    scrubbed = true;
    return "[store price]";
  });
  return { text: next, scrubbed };
}

export function finalizeAgentPrices(
  text: string,
  sessionId: string,
  hintedSkus: string[],
): { text: string; scrubbed: boolean } {
  const resolved = resolvePriceTokens(text, sessionId);
  return scrubInventedMoney(resolved, allowedPaiseForTurn(sessionId, hintedSkus));
}

/** Quote body for the LLM only — no numeric amounts it could restate wrong. */
export function quoteSummaryForLlm(status: number, error?: string) {
  return {
    httpStatus: status,
    error: error ?? null,
    payable: cartPayableRef(),
    remaining: mandateRemainingRef(),
    max: mandateMaxRef(),
    note: PRICE_TOKEN_HELP,
  };
}
