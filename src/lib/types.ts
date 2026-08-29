export type MoneyPaise = number;

export type Product = {
  sku: string;
  name: string;
  short: string;
  details: string;
  category: "keyboard" | "mouse" | "monitor" | "audio" | "controller" | "accessory";
  pricePaise: MoneyPaise;
  image: string;
  tags: string[];
  upsellSku?: string;
};

export type CartLine = {
  sku: string;
  qty: number;
};

export type Mandate = {
  id: string;
  agentId: string;
  merchantId: string;
  maxPaise: MoneyPaise;
  remainingPaise: MoneyPaise;
  categories: string[] | "*";
  expiresAt: string;
  signature: string;
  createdAt: string;
  /** Ed25519 signing metadata from buyer authority */
  alg?: string;
  kid?: string;
};

export type Campaign = {
  id: string;
  name: string;
  percentOff: number;
  categories: string[];
  skus: string[];
  budgetPaise: MoneyPaise;
  spentPaise: MoneyPaise;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

export type AuditEvent = {
  id: string;
  at: string;
  sessionId: string;
  type: string;
  explainable: boolean;
  bounded: boolean;
  gated: boolean;
  reason: string;
  data: Record<string, unknown>;
};

export type CheckoutRecord = {
  id: string;
  sessionId: string;
  status: "quoted" | "paid" | "failed" | "blocked";
  amountPaise: MoneyPaise;
  subtotalPaise: MoneyPaise;
  discountPaise: MoneyPaise;
  campaignId?: string;
  orderId?: string;
  paymentId?: string;
  explanation: string;
  lines: Array<{ sku: string; name: string; qty: number; unitPaise: number; linePaise: number }>;
  stopRule?: string;
  createdAt: string;
};

export type NegotiateSuggestion = {
  action: "remove_sku" | "swap_to";
  sku: string;
  name: string;
  pricePaise: number;
  note: string;
  replaceSku?: string;
};

export type U402Quote = {
  u402Version: 1;
  error: "payment_required" | "mandate_exceeded" | "mandate_expired" | "mandate_bad_signature" | "payment_failed";
  accepts: Array<{
    scheme: "razorpay_order";
    network: "razorpay_test" | "razorpay_mock";
    amountPaise: number;
    currency: "INR";
    orderId: string;
    keyId: string;
    checkoutId: string;
    maxTimeoutSeconds: number;
  }>;
  mandate: {
    id: string;
    maxPaise: number;
    remainingPaise: number;
    expiresAt: string;
  };
  breakdown: {
    subtotalPaise: number;
    discountPaise: number;
    payablePaise: number;
    campaignId?: string;
    campaignName?: string;
    lines: CheckoutRecord["lines"];
    explanation: string;
  };
  /** Same buyer agent can act on these — not a second agent */
  negotiate?: NegotiateSuggestion[];
};

export type ChatProductCard = {
  sku: string;
  name: string;
  short: string;
  details: string;
  pricePaise: number;
  image: string;
  discountedPaise?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  products?: ChatProductCard[];
  upsell?: ChatProductCard;
  crossSell?: ChatProductCard[];
  quote?: U402Quote;
};

export type GrowthRow = {
  id: string;
  withUpsell: boolean;
  aovPaise: number;
  recovered: boolean;
  source?: "live" | "seed";
  sessionId?: string;
  at?: string;
};
