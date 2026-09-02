import crypto from "crypto";
import Razorpay from "razorpay";

export function hasLiveTestKeys(): boolean {
  const key = process.env.RAZORPAY_KEY_ID || "";
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  return key.startsWith("rzp_test_") && secret.length >= 8;
}

export function getKeyId(): string {
  return process.env.RAZORPAY_KEY_ID || "rzp_test_pending";
}

function client() {
  if (!hasLiveTestKeys()) return null;
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function createRazorpayOrder(opts: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ orderId: string; network: "razorpay_test" | "razorpay_mock" }> {
  const rzp = client();
  if (!rzp) {
    return { orderId: `order_mock_${opts.receipt}`, network: "razorpay_mock" };
  }
  const order = await withTimeout(
    rzp.orders.create({
      amount: opts.amountPaise,
      currency: "INR",
      receipt: opts.receipt,
      notes: opts.notes,
    }),
    20_000,
    "Razorpay orders.create",
  );
  return { orderId: String(order.id), network: "razorpay_test" };
}

/** Payment Link for MCP / headless agents — human opens URL; Checkout.js UI still works via Order. */
export async function createPaymentLink(opts: {
  amountPaise: number;
  checkoutId: string;
  orderId: string;
  sessionId: string;
  description: string;
}): Promise<{
  url: string;
  id: string;
  network: "razorpay_test" | "razorpay_mock";
  error?: string;
}> {
  const rzp = client();
  if (!rzp) {
    return {
      id: `plink_mock_${opts.checkoutId}`,
      url: `https://rzp.io/mock/${opts.checkoutId}?order=${opts.orderId}`,
      network: "razorpay_mock",
      error: "No Razorpay test keys — mock link only.",
    };
  }
  try {
    const link = await withTimeout(
      rzp.paymentLink.create({
        amount: opts.amountPaise,
        currency: "INR",
        accept_partial: false,
        description: opts.description.slice(0, 255),
        customer: {
          name: "Circuit shopper",
          email: "shopper@circuit.test",
          contact: "+919999999999",
        },
        notes: {
          checkoutId: opts.checkoutId,
          sessionId: opts.sessionId,
          orderId: opts.orderId,
        },
        notify: { sms: false, email: false },
        reminder_enable: false,
      }),
      15_000,
      "Razorpay paymentLink.create",
    );
    const url = typeof link.short_url === "string" ? link.short_url : "";
    if (!url) {
      return {
        id: String(link.id),
        url: "",
        network: "razorpay_test",
        error: "Payment Link created but short_url missing.",
      };
    }
    return {
      id: String(link.id),
      url,
      network: "razorpay_test",
    };
  } catch (e) {
    const msg =
      e && typeof e === "object" && "error" in e
        ? JSON.stringify((e as { error: unknown }).error)
        : e instanceof Error
          ? e.message
          : String(e);
    console.error("[razorpay] paymentLink.create failed", msg);
    // Never invent rzp.io/i/{orderId} — that is not a real Payment Link and returns {}.
    return {
      id: `plink_failed_${opts.checkoutId}`,
      url: "",
      network: "razorpay_test",
      error: `Payment Link API failed (${msg.slice(0, 180)}). Order ${opts.orderId} is still valid — pay via Circuit /shop Checkout (type pay), not a fake short URL.`,
    };
  }
}

export function verifyPaymentSignature(opts: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    return opts.paymentId.startsWith("pay_mock_");
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${opts.orderId}|${opts.paymentId}`)
    .digest("hex");
  return expected === opts.signature;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

export async function fetchPayment(paymentId: string) {
  const rzp = client();
  if (!rzp) {
    return {
      id: paymentId,
      status: paymentId.includes("fail") ? "failed" : "captured",
      amount: 0,
    };
  }
  return rzp.payments.fetch(paymentId);
}
