import crypto from "crypto";
import Razorpay from "razorpay";

export function hasLiveTestKeys(): boolean {
  const key = process.env.RAZORPAY_KEY_ID || "";
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  return key.startsWith("rzp_test_") && secret.length > 8;
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

export async function createRazorpayOrder(opts: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ orderId: string; network: "razorpay_test" | "razorpay_mock" }> {
  const rzp = client();
  if (!rzp) {
    return { orderId: `order_mock_${opts.receipt}`, network: "razorpay_mock" };
  }
  const order = await rzp.orders.create({
    amount: opts.amountPaise,
    currency: "INR",
    receipt: opts.receipt,
    notes: opts.notes,
  });
  return { orderId: String(order.id), network: "razorpay_test" };
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
