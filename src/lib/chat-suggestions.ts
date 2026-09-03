import type { ChatMessage } from "./types";

/** First-open chips when the hello message is the only assistant turn. */
export const DEFAULT_CHAT_SUGGESTIONS = [
  "show me something under 2000",
  "what offers are live?",
  "show me a cheap mouse",
];

const PAY_CHIP = "pay";

function mentionsPay(chip: string) {
  return /\bpay\b/i.test(chip);
}

/** Ensure `pay` is always offered once the bag has items (unless they just paid). */
function withPayIfCart(chips: string[], cartHasItems: boolean, justPaid: boolean): string[] {
  const base = chips.slice(0, 3);
  if (!cartHasItems || justPaid) return base;
  if (base.some(mentionsPay)) {
    return base.map((c) => (mentionsPay(c) ? PAY_CHIP : c));
  }
  return [PAY_CHIP, ...base.filter((c) => !mentionsPay(c))].slice(0, 3);
}

/**
 * Next-message chips derived from what the agent just showed (cards / cart / quote).
 * Intent-based phrasing — not a brand word list.
 * When the bag has lines, `pay` is always one of the chips.
 */
export function suggestionsForMessage(
  m: ChatMessage,
  opts?: { cartHasItems?: boolean },
): string[] {
  const cartHasItems = Boolean(opts?.cartHasItems);
  const justPaid = Boolean(m.receipt);

  if (m.suggestions?.length) {
    return withPayIfCart(m.suggestions, cartHasItems, justPaid);
  }
  if (m.quote) {
    return withPayIfCart(["pay", "what's in my bag", "show me an upgrade"], cartHasItems, justPaid);
  }
  if (m.receipt) {
    return ["show me something else", "what's in my bag", "what offers are live?"];
  }
  if (m.showCart && m.products?.length) {
    return withPayIfCart(
      ["pay", "remove one item from my bag", "add a cheaper companion"],
      cartHasItems,
      justPaid,
    );
  }
  if (m.products?.length) {
    const chips = ["add the first one to my bag", "tell me about the first one"];
    chips.push(m.upsell ? "tell me about the upgrade" : "show something cheaper");
    return withPayIfCart(chips, cartHasItems, justPaid);
  }
  if (m.crossSell?.length) {
    return withPayIfCart(
      ["add the first pair to my bag", "what's in my bag", "pay"],
      cartHasItems,
      justPaid,
    );
  }
  if (m.id === "hello") {
    return withPayIfCart(DEFAULT_CHAT_SUGGESTIONS, cartHasItems, justPaid);
  }
  return withPayIfCart(DEFAULT_CHAT_SUGGESTIONS, cartHasItems, justPaid);
}
