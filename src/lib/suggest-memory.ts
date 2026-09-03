import { getOrCreateSession, saveDb, type SessionSuggestItem } from "./store";
import type { ChatProductCard } from "./types";

function item(p: { sku: string; name: string }): SessionSuggestItem {
  return { sku: p.sku, name: p.name };
}

/** Persist what the UI just showed so “add the 2nd / the mouse” can resolve next turn. */
export function rememberSuggest(
  sessionId: string,
  opts: {
    products?: ChatProductCard[];
    upsell?: ChatProductCard;
    crossSell?: ChatProductCard[];
  },
) {
  const products = opts.products || [];
  const crossSell = opts.crossSell || [];
  if (!products.length && !opts.upsell && !crossSell.length) return;
  const session = getOrCreateSession(sessionId);
  session.lastSuggest = {
    products: products.map(item),
    upsell: opts.upsell ? item(opts.upsell) : undefined,
    crossSell: crossSell.map(item),
    at: new Date().toISOString(),
  };
  saveDb();
}

export function getLastSuggest(sessionId: string) {
  return getOrCreateSession(sessionId).lastSuggest;
}

/** Build a short block the LLM can use for ordinals / “the suggested mouse”. */
export function formatSuggestContext(sessionId: string): string {
  const s = getLastSuggest(sessionId);
  if (!s) return "No prior suggestion list on this session.";
  const lines: string[] = [
    "Products already shown to the buyer (match their words to these FULL names/SKUs — do not invent SKUs):",
  ];
  s.products.forEach((p, i) => {
    lines.push(`Match ${i + 1}: sku=${p.sku} name=${p.name}`);
  });
  if (s.upsell) lines.push(`Upgrade/step-up: sku=${s.upsell.sku} name=${s.upsell.name}`);
  s.crossSell.forEach((p, i) => {
    lines.push(`Pair ${i + 1}: sku=${p.sku} name=${p.name}`);
  });
  lines.push(
    "Ordinals map to Match N above ONLY: “1st / first / the first one” = Match 1’s exact sku; “2nd / second” = Match 2. Do not renumber from your own sentence order. Add only what they asked for.",
  );
  return lines.join("\n");
}
