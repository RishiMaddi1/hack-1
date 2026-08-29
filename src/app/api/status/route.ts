import { NextResponse } from "next/server";
import { hasLiveTestKeys } from "@/lib/razorpay";

export function GET() {
  return NextResponse.json({
    razorpayTest: hasLiveTestKeys(),
    keyId: hasLiveTestKeys() ? process.env.RAZORPAY_KEY_ID : null,
    llm: Boolean(process.env.OPENAI_API_KEY),
  });
}
