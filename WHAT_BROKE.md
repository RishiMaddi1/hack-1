# What broke (and how we got out)

Short answers for the Buildathon “what broke at 2 AM” ask. Circuit (u402) · Azure App Service · Razorpay test mode.

---

## 1. Azure kept serving the *old* homepage

**Broke:** Live URL showed the old “Keyboards, mice…” landing. Localhost and GitHub had the new Buildathon page.

**Why:** Early deploys left stale files in `/home/site/wwwroot`. New builds didn’t fully replace them. GitHub was fine — Azure wasn’t.

**Out:** Deploy a real Next **standalone** zip (with `.next` + static), verify homepage text in CI, hard-refresh after green deploys. Code was never lost.

---

## 2. App started, then crashed: missing `.next`

**Broke:** Logs showed Next Ready, then `Could not find a production build in './.next'` / missing `routes-manifest.json`. Site 503.

**Why:** Azure/Oryx was interfering with the bundle, or the deploy package was incomplete (hidden `.next` not landing cleanly).

**Out:** Build in GitHub Actions, ship standalone + `static`, set `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, start with `node start.js` (forces bind to `0.0.0.0`). Don’t let Azure rebuild on the server.

---

## 3. Deploy stuck on 409 Conflict + “In Progress” forever

**Broke:** GitHub Actions failed with `Conflict (CODE: 409)`. Portal still said “Last deployment: In Progress, building…” even after the pipeline failed. Re-runs kept 409’ing.

**Why:** A cancelled/fat OneDeploy left a **zombie lock** (`/home/site/deployments/pending`). Actions failed; Kudu never cleared “pending.” Disconnecting Deployment Center was correct (`Provider: None`) — the lock was separate.

**Out:** Kudu SSH → delete `pending` + clear `/home/site/locks/*`. Don’t hammer re-runs into a lock. Slim the zip (~30MB, not 500MB+ cache). One deploy at a time.

---

## 4. Pay hung / “Working the tools…” / no Checkout popup

**Broke:** AI “hi” worked; **pay** stuck or Order failed; sometimes Order succeeded but Razorpay popup didn’t show.

**Why (three separate things):**
1. Wrong `RAZORPAY_KEY_SECRET` on Azure → Order create failed (local `.env` was fine).
2. UI stayed on “Working the tools…” while waiting on checkout / opening Checkout.
3. Buyer-agent drawer (`z-50`) sat **over** Razorpay Checkout.

**Out:** Fix Azure env + **Restart** (env only applies on process start). Clear busy before opening Checkout; close the drawer, then `rzp.open()`. Timeouts on Order / Payment Link APIs.

---

## 5. Fat deploy zip made everything slow

**Broke:** Deploys took forever; OneDeploy looked “stuck.”

**Why:** Workflow copied the **entire** `.next` including cache → ~500MB+ artifact.

**Out:** Slim standalone only (~30MB): `standalone` + `.next/static` + `public`. Drop retry-sleep spam once locks are understood.

---

## One-liners (if the form wants short answers)

| Question | Answer |
|---|---|
| What broke? | Azure deploy packaging + a stuck Kudu `pending` lock; wrong Razorpay secret on Azure; Checkout hidden under the agent drawer. |
| Was the app wrong? | No — localhost and GitHub had the right Buildathon app. |
| How did you get out? | Standalone CI zip, disable Oryx rebuild, clear Kudu locks, fix env + restart, close drawer before Razorpay. |
| Proof it works? | Live pay: HTTP 402 → Razorpay capture → `/audit` trail with real `order_` / `pay_` IDs. |

---

## Live proof

- Site: `https://circuit-rishi-g9cxfud2ancddpbt.centralindia-01.azurewebsites.net`
- Repo: `https://github.com/RishiMaddi1/hack-1`
- Happy path verified: register → mandate → agent shop → pay → captured → audit
