import { circuitPayUrl, getPublicAppOrigin } from "./public-origin";

export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string };

/** Thin Resend HTTP client — no SDK required. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  const from =
    process.env.RESEND_FROM?.trim() || "Circuit <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; error?: { message?: string } };
    if (!res.ok) {
      return {
        ok: false,
        error: body.error?.message || body.message || `Resend HTTP ${res.status}`,
      };
    }
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function shopUrl(): string {
  return `${getPublicAppOrigin()}/shop`;
}

export function payUrlForOrder(orderId: string): string {
  return circuitPayUrl(orderId);
}
