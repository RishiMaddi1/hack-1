import { writeAudit } from "./audit";
import { searchCatalog } from "./catalog";
import { runOpenAIBuyer } from "./openai-agent";
import { enrichFromSearch } from "./recommend";
import type { ChatMessage } from "./types";

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  /** SKUs shown on cards that turn — so ordinals resolve across turns for the LLM. */
  skus?: string[];
  upsellSku?: string;
  pairSkus?: string[];
};

/**
 * Buyer chat: LLM + tools own add / remove / search / cart / pay.
 * No stop-word tables or speech parsers — catalog + bag are queried via tools.
 * Offline fallback only if OpenAI is unavailable.
 */
export async function runBuyerAgent(
  sessionId: string,
  text: string,
  history: ChatTurn[] = [],
): Promise<ChatMessage> {
  const raw = text.trim();
  writeAudit({
    sessionId,
    type: "agent.turn",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `Buyer said: ${raw.slice(0, 180)}`,
    data: { text: raw, historyTurns: history.length },
  });

  const fromOpenAI = await runOpenAIBuyer(sessionId, raw, history);
  if (fromOpenAI) return fromOpenAI;

  const hits = searchCatalog(raw);
  const rec = enrichFromSearch(sessionId, hits, raw);
  writeAudit({
    sessionId,
    type: "catalog.search",
    explainable: true,
    bounded: true,
    gated: true,
    reason: `OpenAI unavailable — searched catalog for “${raw}”.`,
    data: { query: raw, skus: hits.map((p) => p.sku) },
  });
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text: rec.products.length
      ? "Here is what matches in the catalog."
      : "Nothing matched in the catalog — try different words.",
    products: rec.products,
    upsell: rec.upsell,
    crossSell: rec.crossSell,
  };
}
