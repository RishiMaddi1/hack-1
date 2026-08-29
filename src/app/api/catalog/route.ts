import { NextResponse } from "next/server";
import { catalogFeed, searchCatalog } from "@/lib/catalog";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  if (q) {
    return NextResponse.json({ products: searchCatalog(q) });
  }
  return NextResponse.json(catalogFeed());
}
