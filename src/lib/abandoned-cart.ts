import { getProduct, PRODUCTS } from "./catalog";
import { formatInr } from "./money";
import { sendEmail, shopUrl } from "./mail";
import { getPublicAppOrigin } from "./public-origin";
import { writeAudit } from "./audit";
import { priceCart, type PricedCart } from "./quote";
import { quoteCheckout } from "./checkout";
import { getDb, saveDb } from "./store";
import type { CartLine, Product, Shopper } from "./types";

/** @deprecated kept for callers that still pass tip lists — prefer buildCheaperPlan */
export type CartSuggestion = {
  kind: "cheaper_swap" | "trim_expensive";
  forSku?: string;
  forName?: string;
  forImage?: string;
  forPricePaise?: number;
  suggestSku: string;
  suggestName: string;
  suggestImage: string;
  suggestPricePaise: number;
  keepLines?: Array<{ sku: string; name: string; image: string; qty: number; linePaise: number }>;
  note: string;
};

export type CheaperPlan = {
  kind: "cheaper_swaps" | "trim_cart";
  /** Alternate bag shown as bill #2 */
  cart: CartLine[];
  title: string;
  blurb: string;
  /** Human-readable swap/drop lines for plain text */
  notes: string[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cheapestInCategory(product: Product): Product | null {
  const alts = PRODUCTS.filter(
    (p) => p.category === product.category && p.sku !== product.sku && p.pricePaise < product.pricePaise,
  ).sort((a, b) => a.pricePaise - b.pricePaise);
  return alts[0] || null;
}

/**
 * Bill #2 plan: cheaper same-category swaps first; else drop the priciest line.
 * Never suggests same-price “rethink” SKUs.
 */
export function buildCheaperPlan(cart: CartLine[]): CheaperPlan | null {
  const lines = cart
    .map((l) => ({ line: l, product: getProduct(l.sku) }))
    .filter((x): x is { line: CartLine; product: Product } => Boolean(x.product));
  if (!lines.length) return null;

  const notes: string[] = [];
  const swapped: CartLine[] = [];
  let didSwap = false;

  for (const { line, product } of lines) {
    const alt = cheapestInCategory(product);
    if (alt) {
      didSwap = true;
      swapped.push({ sku: alt.sku, qty: line.qty });
      notes.push(
        `Swap ${product.name} (${formatInr(product.pricePaise)}) → ${alt.name} (${formatInr(alt.pricePaise)})`,
      );
    } else {
      swapped.push({ sku: line.sku, qty: line.qty });
    }
  }

  if (didSwap) {
    const original = priceCart(cart).payablePaise;
    const next = priceCart(swapped).payablePaise;
    if (next < original) {
      return {
        kind: "cheaper_swaps",
        cart: swapped,
        title: "Bill 2 · cheaper same-category bag",
        blurb: `Same categories, lower total — save ${formatInr(original - next)}.`,
        notes,
      };
    }
  }

  if (lines.length > 1) {
    const sorted = [...lines].sort(
      (a, b) => b.product.pricePaise * b.line.qty - a.product.pricePaise * a.line.qty,
    );
    const drop = sorted[0]!;
    const keep = sorted.slice(1).map((x) => ({ sku: x.product.sku, qty: x.line.qty }));
    const keepTotal = priceCart(keep).payablePaise;
    return {
      kind: "trim_cart",
      cart: keep,
      title: "Bill 2 · finish without the expensive item",
      blurb: `Drop ${drop.product.name} (${formatInr(drop.product.pricePaise * drop.line.qty)}) and pay less.`,
      notes: [
        `Remove ${drop.product.name}`,
        ...keep.map((k) => {
          const p = getProduct(k.sku)!;
          return `Keep ${p.name} ×${k.qty}`;
        }),
        `New total ${formatInr(keepTotal)}`,
      ],
    };
  }

  return null;
}

/** Legacy wrapper — used only if something still expects tip chips. */
export function buildAbandonedSuggestions(cart: CartLine[]): CartSuggestion[] {
  const plan = buildCheaperPlan(cart);
  if (!plan) return [];
  if (plan.kind === "trim_cart") {
    const dropNote = plan.notes[0] || "";
    const first = plan.cart[0]!;
    const p = getProduct(first.sku)!;
    return [
      {
        kind: "trim_expensive",
        suggestSku: first.sku,
        suggestName: plan.cart.map((l) => getProduct(l.sku)?.name || l.sku).join(", "),
        suggestImage: p.image,
        suggestPricePaise: priceCart(plan.cart).payablePaise,
        note: plan.blurb,
        keepLines: plan.cart.map((l) => {
          const prod = getProduct(l.sku)!;
          return {
            sku: l.sku,
            name: prod.name,
            image: prod.image,
            qty: l.qty,
            linePaise: prod.pricePaise * l.qty,
          };
        }),
      },
    ];
  }
  return plan.notes.slice(0, 4).map((note, i) => {
    const line = plan.cart[i] || plan.cart[0]!;
    const p = getProduct(line.sku)!;
    return {
      kind: "cheaper_swap" as const,
      suggestSku: p.sku,
      suggestName: p.name,
      suggestImage: p.image,
      suggestPricePaise: p.pricePaise,
      note,
    };
  });
}

function productThumb(src: string, alt: string, size = 64): string {
  const safeAlt = escapeHtml(alt);
  return `<img src="${escapeHtml(src)}" alt="${safeAlt}" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;object-fit:cover;border:0;border-radius:4px;background:#f3f3f3;" />`;
}

function moneyCell(paise: number): string {
  return `<span style="white-space:nowrap;font-variant-numeric:tabular-nums;">${escapeHtml(formatInr(paise))}</span>`;
}

function billLinesHtml(priced: PricedCart): string {
  return priced.lines
    .map((l) => {
      const p = getProduct(l.sku);
      const img = p?.image
        ? productThumb(p.image, l.name, 72)
        : `<div style="width:72px;height:72px;background:#eee;border-radius:4px;"></div>`;
      return `
        <tr>
          <td style="padding:12px 8px 12px 0;vertical-align:middle;width:72px;">${img}</td>
          <td style="padding:12px 8px;vertical-align:middle;">
            <div style="font-size:14px;font-weight:600;color:#111;line-height:1.3;">${escapeHtml(l.name)}</div>
            <div style="font-size:12px;color:#666;margin-top:4px;">Qty ${l.qty} · ${moneyCell(l.unitPaise)} each</div>
          </td>
          <td style="padding:12px 0;vertical-align:middle;text-align:right;font-size:14px;font-weight:600;color:#111;">
            ${moneyCell(l.linePaise)}
          </td>
        </tr>`;
    })
    .join("");
}

function billTotalsHtml(priced: PricedCart): string {
  const discountRow =
    priced.discountPaise > 0
      ? `<tr>
          <td colspan="2" style="padding:6px 8px 6px 0;font-size:13px;color:#666;">${escapeHtml(priced.campaignName || "Offer")}</td>
          <td style="padding:6px 0;text-align:right;font-size:13px;color:#166534;">−${moneyCell(priced.discountPaise)}</td>
        </tr>`
      : "";
  return `
    <tr><td colspan="3" style="border-top:1px dashed #d4d4d8;height:1px;padding:0;"></td></tr>
    <tr>
      <td colspan="2" style="padding:10px 8px 4px 0;font-size:13px;color:#52525b;">Subtotal</td>
      <td style="padding:10px 0 4px;text-align:right;font-size:13px;color:#18181b;">${moneyCell(priced.subtotalPaise)}</td>
    </tr>
    ${discountRow}
    <tr>
      <td colspan="2" style="padding:8px 8px 4px 0;font-size:15px;font-weight:700;color:#18181b;">Total due</td>
      <td style="padding:8px 0 4px;text-align:right;font-size:16px;font-weight:700;color:#18181b;">${moneyCell(priced.payablePaise)}</td>
    </tr>`;
}

function payButton(href: string, label: string, dark = true): string {
  const bg = dark ? "#18181b" : "#ffffff";
  const fg = dark ? "#ffffff" : "#18181b";
  const border = dark ? "none" : "1px solid #18181b";
  return `<a href="${escapeHtml(href)}" style="display:block;text-align:center;background:${bg};color:${fg};text-decoration:none;font-size:15px;font-weight:600;padding:14px 20px;border-radius:6px;border:${border};box-sizing:border-box;">
    ${escapeHtml(label)}
  </a>`;
}

/** Two-bill layout: exact abandoned cart, then optional cheaper alternate bag. */
export function buildAbandonedCartEmailHtml(opts: {
  username: string;
  cart: CartLine[];
  suggestions?: CartSuggestion[];
  plan?: CheaperPlan | null;
  /** Bill 1 pay link (shop or /pay/order_…) */
  payUrl: string;
  /** Bill 2 pay link — same style as bill 1 when a cheaper plan exists */
  cheaperPayUrl?: string;
}): string {
  const priced = priceCart(opts.cart);
  const plan = opts.plan === undefined ? buildCheaperPlan(opts.cart) : opts.plan;
  const name = escapeHtml(opts.username);
  const payUrl = opts.payUrl;
  const cheaperPayUrl = opts.cheaperPayUrl || opts.payUrl;
  // Absolute URL required — Gmail proxies images and cannot reach localhost.
  // Prefer EMAIL_ASSET_ORIGIN (e.g. Azure) when sending from local so the art loads.
  const assetOrigin = (
    process.env.EMAIL_ASSET_ORIGIN ||
    process.env.PUBLIC_APP_URL ||
    getPublicAppOrigin()
  ).replace(/\/$/, "");
  const bgUrl = escapeHtml(`${assetOrigin}/email-background.png`);
  // Deep indigo fallback when images are blocked
  const bgFallback = "#12081f";

  const bill1 = `
    <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:8px;">Bill 1 · your open cart</div>
    <p style="margin:0 0 12px;font-size:13px;color:#52525b;">Exact bag you left — pay this to finish as-is.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:2px solid #18181b;">
      ${billLinesHtml(priced)}
      ${billTotalsHtml(priced)}
    </table>
    <div style="margin-top:16px;">${payButton(payUrl, `Pay ${formatInr(priced.payablePaise)} →`, true)}</div>`;

  let bill2 = "";
  if (plan) {
    const alt = priceCart(plan.cart);
    bill2 = `
      <div style="margin-top:28px;padding-top:24px;border-top:1px solid #e4e4e7;">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#166534;font-weight:600;margin-bottom:8px;">${escapeHtml(plan.title)}</div>
        <p style="margin:0 0 12px;font-size:13px;color:#52525b;">${escapeHtml(plan.blurb)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:2px solid #166534;">
          ${billLinesHtml(alt)}
          ${billTotalsHtml(alt)}
        </table>
        <div style="margin-top:16px;">${payButton(cheaperPayUrl, `Pay ${formatInr(alt.payablePaise)} →`, true)}</div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background-color:${bgFallback};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${bgFallback}" style="background-color:${bgFallback};background-image:url('${bgUrl}');background-repeat:no-repeat;background-position:center top;background-size:cover;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.45);">
          <tr>
            <td style="padding:20px 24px 12px;border-bottom:1px solid #e4e4e7;">
              <div style="font-size:18px;font-weight:700;color:#111;letter-spacing:-0.02em;">Circuit</div>
              <div style="font-size:12px;color:#71717a;margin-top:4px;">Open cart · two bills</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;">
              <p style="margin:0 0 20px;font-size:15px;color:#18181b;line-height:1.4;">Hey ${name} — you left a bag open.</p>
              ${bill1}
              ${bill2}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              <p style="margin:14px 0 0;font-size:11px;color:#a1a1aa;text-align:center;line-height:1.4;">
                Optional reminder — shopping &amp; MCP work without email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildAbandonedCartEmailText(opts: {
  username: string;
  cart: CartLine[];
  plan: CheaperPlan | null;
  payUrl: string;
  cheaperPayUrl?: string;
}): string {
  const priced = priceCart(opts.cart);
  const lines = priced.lines
    .map((l) => `  ${l.qty}× ${l.name} @ ${formatInr(l.unitPaise)} = ${formatInr(l.linePaise)}`)
    .join("\n");
  const parts = [
    `Hey ${opts.username},`,
    "",
    "Bill 1 — your open cart:",
    lines || "  (empty)",
    `Total due ${formatInr(priced.payablePaise)}`,
    `Pay: ${opts.payUrl}`,
  ];
  if (opts.plan) {
    const alt = priceCart(opts.plan.cart);
    parts.push(
      "",
      opts.plan.title,
      opts.plan.blurb,
      ...opts.plan.notes.map((n) => `  - ${n}`),
      ...alt.lines.map((l) => `  ${l.qty}× ${l.name} = ${formatInr(l.linePaise)}`),
      `Cheaper total ${formatInr(alt.payablePaise)}`,
      `Pay: ${opts.cheaperPayUrl || opts.payUrl}`,
    );
  }
  return parts.join("\n");
}

export type AbandonedRunResult = {
  scanned: number;
  sent: number;
  skipped: number;
  errors: Array<{ shopperId: string; error: string }>;
};

export type AbandonedSendOneResult =
  | {
      ok: true;
      sessionId: string;
      shopperId: string;
      email: string;
      dryRun?: boolean;
    }
  | {
      ok: false;
      sessionId: string;
      error: string;
      code:
        | "no_session"
        | "empty_cart"
        | "already_paid"
        | "no_shopper"
        | "no_email"
        | "already_sent"
        | "too_young"
        | "pay_link"
        | "mail";
    };

/** Create a Circuit /pay/{orderId} link for the session's current cart. */
async function payLinkForCurrentCart(
  sessionId: string,
): Promise<{ ok: true; url: string; orderId: string } | { ok: false; error: string }> {
  try {
    const quoted = await quoteCheckout(sessionId);
    if (quoted.status !== 402) {
      const err =
        "error" in quoted.body
          ? String((quoted.body as { error?: string }).error || quoted.status)
          : `quote_status_${quoted.status}`;
      return { ok: false, error: err };
    }
    const url = quoted.body.paymentLinkUrl || quoted.body.accepts?.[0]?.paymentLinkUrl;
    const orderId = quoted.body.accepts?.[0]?.orderId;
    if (!url || !orderId || !url.includes("/pay/")) {
      return { ok: false, error: "missing_pay_url" };
    }
    return { ok: true, url, orderId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function shopperForSession(sessionId: string): Shopper | undefined {
  const db = getDb();
  const session = db.sessions[sessionId];
  if (session?.shopperId && db.shoppers[session.shopperId]) {
    return db.shoppers[session.shopperId];
  }
  return Object.values(db.shoppers).find((s) => s.sessionId === sessionId);
}

/**
 * Merchant demo: remind one left-cart session (must have verified email).
 * `force` ignores abandonedEmailSentAt; `minAgeMs: 0` for instant demo.
 */
export async function sendAbandonedCartForSession(
  sessionId: string,
  opts?: { minAgeMs?: number; dryRun?: boolean; force?: boolean },
): Promise<AbandonedSendOneResult> {
  const minAgeMs = opts?.minAgeMs ?? 0;
  const dryRun = Boolean(opts?.dryRun);
  const force = Boolean(opts?.force);
  const db = getDb();
  const session = db.sessions[sessionId];
  if (!session) {
    return { ok: false, sessionId, error: "Session not found.", code: "no_session" };
  }
  if (!session.cart?.length) {
    return { ok: false, sessionId, error: "Cart is empty.", code: "empty_cart" };
  }
  const paid = Object.values(db.checkouts).some(
    (c) => c.sessionId === sessionId && c.status === "paid",
  );
  if (paid) {
    return { ok: false, sessionId, error: "This session already paid.", code: "already_paid" };
  }

  const shopper = shopperForSession(sessionId);
  if (!shopper) {
    return {
      ok: false,
      sessionId,
      error: "No shopper on this session — guest / MCP carts have no email.",
      code: "no_shopper",
    };
  }
  if (!shopper.emailVerified || !shopper.email) {
    return {
      ok: false,
      sessionId,
      error: "Shopper has not verified an email yet.",
      code: "no_email",
    };
  }
  if (!force && shopper.abandonedEmailSentAt) {
    return {
      ok: false,
      sessionId,
      error: "Reminder already sent — use force to resend in demo.",
      code: "already_sent",
    };
  }

  const touched = Date.parse(session.cartTouchedAt || shopper.createdAt);
  const ageBase = Number.isFinite(touched) ? touched : Date.now();
  if (Date.now() - ageBase < minAgeMs) {
    return {
      ok: false,
      sessionId,
      error: "Cart is newer than minAgeMs.",
      code: "too_young",
    };
  }

  const plan = buildCheaperPlan(session.cart);
  const payable = priceCart(session.cart).payablePaise;
  const subject = `Your Circuit bag — ${formatInr(payable)} waiting`;

  let bill1Pay = "";
  let bill2Pay = "";
  if (!dryRun) {
    const link1 = await payLinkForCurrentCart(session.id);
    if (!link1.ok) {
      return { ok: false, sessionId, error: `bill1_pay: ${link1.error}`, code: "pay_link" };
    }
    bill1Pay = link1.url;

    if (plan) {
      const savedCart = session.cart.map((l) => ({ ...l }));
      session.cart = plan.cart.map((l) => ({ ...l }));
      saveDb();
      const link2 = await payLinkForCurrentCart(session.id);
      session.cart = savedCart;
      saveDb();
      if (!link2.ok) {
        return { ok: false, sessionId, error: `bill2_pay: ${link2.error}`, code: "pay_link" };
      }
      bill2Pay = link2.url;
    }
  } else {
    bill1Pay = `${shopUrl()}/pay/dry_run_bill1`;
    bill2Pay = `${shopUrl()}/pay/dry_run_bill2`;
  }

  const html = buildAbandonedCartEmailHtml({
    username: shopper.username,
    cart: session.cart,
    plan,
    payUrl: bill1Pay,
    cheaperPayUrl: bill2Pay || bill1Pay,
  });
  const text = buildAbandonedCartEmailText({
    username: shopper.username,
    cart: session.cart,
    plan,
    payUrl: bill1Pay,
    cheaperPayUrl: bill2Pay || bill1Pay,
  });

  if (dryRun) {
    return { ok: true, sessionId, shopperId: shopper.id, email: shopper.email, dryRun: true };
  }

  const sent = await sendEmail({
    to: shopper.email,
    subject,
    html,
    text,
  });

  if (!sent.ok) {
    return { ok: false, sessionId, error: sent.error, code: "mail" };
  }

  shopper.abandonedEmailSentAt = new Date().toISOString();
  writeAudit({
    sessionId: session.id,
    type: "shopper.abandoned_cart_email",
    explainable: true,
    bounded: true,
    gated: false,
    reason: `Abandoned-cart reminder emailed to ${shopper.email}.`,
    data: {
      shopperId: shopper.id,
      planKind: plan?.kind || "none",
      bill1Pay,
      bill2Pay: plan ? bill2Pay : null,
      resendId: sent.id,
    },
  });
  saveDb();
  return { ok: true, sessionId, shopperId: shopper.id, email: shopper.email };
}

/**
 * Email verified shoppers with a non-empty cart that hasn't been paid,
 * older than minAgeMs (default 24h). MCP shoppers without email are ignored.
 * Pass `force: true` to ignore abandonedEmailSentAt (demo / re-test only).
 */
export async function runAbandonedCartEmails(opts?: {
  minAgeMs?: number;
  dryRun?: boolean;
  force?: boolean;
}): Promise<AbandonedRunResult> {
  const minAgeMs = opts?.minAgeMs ?? Number(process.env.ABANDONED_CART_MIN_AGE_MS || 24 * 60 * 60_000);
  const dryRun = Boolean(opts?.dryRun);
  const force = Boolean(opts?.force);
  const db = getDb();
  const result: AbandonedRunResult = { scanned: 0, sent: 0, skipped: 0, errors: [] };

  const shoppers = Object.values(db.shoppers).filter(
    (s): s is Shopper & { email: string } => Boolean(s.emailVerified && s.email),
  );

  for (const shopper of shoppers) {
    result.scanned += 1;
    const one = await sendAbandonedCartForSession(shopper.sessionId, { minAgeMs, dryRun, force });
    if (one.ok) {
      result.sent += 1;
    } else if (one.code === "mail" || one.code === "pay_link") {
      result.errors.push({ shopperId: shopper.id, error: one.error });
    } else {
      result.skipped += 1;
    }
  }

  return result;
}
