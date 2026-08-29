import { NextResponse } from "next/server";
import { listCampaigns, upsertCampaign } from "@/lib/campaigns";

export function GET() {
  return NextResponse.json({ campaigns: listCampaigns() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    name?: string;
    percentOff?: number;
    categories?: string[];
    skus?: string[];
    budgetPaise?: number;
    active?: boolean;
    startsAt?: string;
    endsAt?: string;
  };
  if (!body.name || body.percentOff == null) {
    return NextResponse.json({ error: "name and percentOff required" }, { status: 400 });
  }
  const campaign = upsertCampaign({
    id: body.id,
    name: body.name,
    percentOff: body.percentOff,
    categories: body.categories,
    skus: body.skus,
    budgetPaise: body.budgetPaise,
    active: body.active,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
  });
  return NextResponse.json({ campaign });
}
