import { createHash, randomInt } from "crypto";
import { writeAudit } from "./audit";
import { sendEmail } from "./mail";
import { authenticateShopper } from "./shoppers";
import { getDb, saveDb } from "./store";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashOtp(code: string, shopperId: string): string {
  return createHash("sha256").update(`${shopperId}:${code}`).digest("hex");
}

export function emailStatusForShopper(shopperId: string) {
  const shopper = getDb().shoppers[shopperId];
  if (!shopper) return { email: null, emailVerified: false };
  return {
    email: shopper.emailVerified ? shopper.email || null : shopper.email || null,
    emailVerified: Boolean(shopper.emailVerified),
    pendingEmail: !shopper.emailVerified && shopper.email ? shopper.email : null,
  };
}

export async function requestEmailOtp(opts: {
  shopperToken: string;
  email: string;
}): Promise<{ ok: true; message: string } | { ok: false; status: number; error: string; message: string }> {
  const auth = authenticateShopper(opts.shopperToken);
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error, message: auth.message };

  const email = opts.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "EMAIL_INVALID", message: "Enter a valid email." };
  }

  const code = String(randomInt(100000, 999999));
  const shopper = auth.shopper;
  shopper.email = email;
  shopper.emailVerified = false;
  shopper.emailOtpHash = hashOtp(code, shopper.id);
  shopper.emailOtpExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  saveDb();

  const sent = await sendEmail({
    to: email,
    subject: "Circuit · verify email for cart reminders",
    text: `Your Circuit code is ${code}. It expires in 10 minutes. Optional — shopping works without this.`,
    html: `<p>Your Circuit verification code:</p><p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p><p>Expires in 10 minutes.</p><p style="color:#666">Optional — MCP and shopping work without verifying email.</p>`,
  });

  if (!sent.ok) {
    shopper.emailOtpHash = undefined;
    shopper.emailOtpExpiresAt = undefined;
    saveDb();
    return {
      ok: false,
      status: 502,
      error: "EMAIL_SEND_FAILED",
      message: `Could not send email (${sent.error}). Check RESEND_API_KEY / RESEND_FROM. Free Resend only delivers to your Resend account email until you verify a domain.`,
    };
  }

  writeAudit({
    sessionId: auth.session.id,
    type: "shopper.email_otp_sent",
    explainable: true,
    bounded: true,
    gated: false,
    reason: `OTP sent to ${email} for optional cart reminders.`,
    data: { shopperId: shopper.id, email },
  });

  return { ok: true, message: "Code sent — check your inbox." };
}

export function verifyEmailOtp(opts: {
  shopperToken: string;
  code: string;
}): { ok: true; email: string } | { ok: false; status: number; error: string; message: string } {
  const auth = authenticateShopper(opts.shopperToken);
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error, message: auth.message };

  const shopper = auth.shopper;
  const code = opts.code.trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, error: "OTP_INVALID", message: "Enter the 6-digit code." };
  }
  if (!shopper.email || !shopper.emailOtpHash || !shopper.emailOtpExpiresAt) {
    return { ok: false, status: 400, error: "OTP_MISSING", message: "Request a code first." };
  }
  if (Date.parse(shopper.emailOtpExpiresAt) < Date.now()) {
    return { ok: false, status: 400, error: "OTP_EXPIRED", message: "Code expired — request a new one." };
  }
  if (hashOtp(code, shopper.id) !== shopper.emailOtpHash) {
    return { ok: false, status: 400, error: "OTP_BAD", message: "Wrong code." };
  }

  shopper.emailVerified = true;
  shopper.emailOtpHash = undefined;
  shopper.emailOtpExpiresAt = undefined;
  saveDb();

  writeAudit({
    sessionId: auth.session.id,
    type: "shopper.email_verified",
    explainable: true,
    bounded: true,
    gated: false,
    reason: `Email verified for “${auth.username}” — abandoned-cart reminders enabled.`,
    data: { shopperId: shopper.id, email: shopper.email },
  });

  return { ok: true, email: shopper.email };
}
