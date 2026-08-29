import { applyCampaign } from "./campaigns";
import { getProduct } from "./catalog";
import { gateCart } from "./mandate";
import type { CartLine, CheckoutRecord, Mandate, Product } from "./types";

export type PricedCart = {
  products: Product[];
  lines: CheckoutRecord["lines"];
  subtotalPaise: number;
  discountPaise: number;
  payablePaise: number;
  campaignId?: string;
  campaignName?: string;
  campaignExplain: string;
};

export function priceCart(cart: CartLine[]): PricedCart {
  const lines: CheckoutRecord["lines"] = [];
  const products: Product[] = [];
  for (const line of cart) {
    const product = getProduct(line.sku);
    if (!product || line.qty <= 0) continue;
    const linePaise = product.pricePaise * line.qty;
    lines.push({
      sku: product.sku,
      name: product.name,
      qty: line.qty,
      unitPaise: product.pricePaise,
      linePaise,
    });
    for (let i = 0; i < line.qty; i++) products.push(product);
  }
  const subtotalPaise = lines.reduce((s, l) => s + l.linePaise, 0);
  const campaign = applyCampaign(products, subtotalPaise);
  const payablePaise = Math.max(0, subtotalPaise - campaign.discountPaise);
  return {
    products,
    lines,
    subtotalPaise,
    discountPaise: campaign.discountPaise,
    payablePaise,
    campaignId: campaign.campaign?.id,
    campaignName: campaign.campaign?.name,
    campaignExplain: campaign.explanation,
  };
}

export function explainMoney(mandate: Mandate, priced: PricedCart) {
  const gate = gateCart(mandate, priced.products, priced.payablePaise);
  const explanation = [
    priced.lines.map((l) => `${l.qty}× ${l.name} @ ₹${l.unitPaise / 100}`).join("; ") || "Empty cart",
    priced.campaignExplain,
    `Payable ₹${priced.payablePaise / 100}.`,
    gate.reason,
  ].join(" ");
  return { gate, explanation };
}
