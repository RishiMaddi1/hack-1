import type { Campaign, Product } from "./types";
import { getDb, saveDb } from "./store";
import { id } from "./ids";

export function listCampaigns(): Campaign[] {
  return getDb().campaigns;
}

export function upsertCampaign(input: Partial<Campaign> & { name: string; percentOff: number }): Campaign {
  const db = getDb();
  const existing = input.id ? db.campaigns.find((c) => c.id === input.id) : undefined;
  const now = new Date();
  const row: Campaign = {
    id: existing?.id || id("cmp"),
    name: input.name,
    percentOff: input.percentOff,
    categories: input.categories ?? existing?.categories ?? [],
    skus: input.skus ?? existing?.skus ?? [],
    budgetPaise: input.budgetPaise ?? existing?.budgetPaise ?? 200000,
    spentPaise: existing?.spentPaise ?? 0,
    startsAt: input.startsAt ?? existing?.startsAt ?? now.toISOString(),
    endsAt: input.endsAt ?? existing?.endsAt ?? new Date(now.getTime() + 7 * 86400000).toISOString(),
    active: input.active ?? existing?.active ?? true,
  };
  if (existing) {
    Object.assign(existing, row);
  } else {
    db.campaigns.unshift(row);
  }
  saveDb();
  return row;
}

export function applyCampaign(
  products: Product[],
  subtotalPaise: number,
): { campaign?: Campaign; discountPaise: number; explanation: string } {
  const now = Date.now();
  const live = getDb().campaigns.filter((c) => {
    if (!c.active) return false;
    if (new Date(c.startsAt).getTime() > now) return false;
    if (new Date(c.endsAt).getTime() < now) return false;
    if (c.spentPaise >= c.budgetPaise) return false;
    return true;
  });

  for (const campaign of live) {
    const eligible = products.filter(
      (p) => campaign.categories.includes(p.category) || campaign.skus.includes(p.sku),
    );
    if (!eligible.length) continue;
    const eligiblePaise = eligible.reduce((sum, p) => {
      const qty = products.filter((x) => x.sku === p.sku).length;
      return sum + p.pricePaise * Math.max(qty, 1);
    }, 0);
    // Use actual cart quantities from a paired list
    void eligiblePaise;
    const discount = Math.round((eligibleSubtotal(products, campaign) * campaign.percentOff) / 100);
    if (discount <= 0) continue;
    if (campaign.spentPaise + discount > campaign.budgetPaise) {
      return {
        campaign,
        discountPaise: 0,
        explanation: `Campaign ${campaign.name} skipped: budget exhausted.`,
      };
    }
    return {
      campaign,
      discountPaise: discount,
      explanation: `Applied ${campaign.name}: ${campaign.percentOff}% off eligible SKUs (−₹${(discount / 100).toFixed(0)}).`,
    };
  }

  return { discountPaise: 0, explanation: "" };
}

function eligibleSubtotal(products: Product[], campaign: Campaign): number {
  return products.reduce((sum, p) => {
    const ok = campaign.categories.includes(p.category) || campaign.skus.includes(p.sku);
    return ok ? sum + p.pricePaise : sum;
  }, 0);
}

export function spendCampaign(campaignId: string, discountPaise: number) {
  const db = getDb();
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return;
  campaign.spentPaise += discountPaise;
  saveDb();
}
