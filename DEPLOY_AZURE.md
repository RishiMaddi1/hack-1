# Deploy Circuit to Azure App Service

Use this guide from the Azure Portal (you are already signed in).

**Repo:** `https://github.com/RishiMaddi1/hack-1`  
**Estimated cost:** ~$13–20/month (B1) — negligible vs credits  
**Region:** Central India or South India

---

## Before you start — have these ready

Copy from your local `.env.local`:

| Setting | Example |
|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_…` |
| `RAZORPAY_KEY_SECRET` | (secret) |
| `RAZORPAY_WEBHOOK_SECRET` | (from Razorpay webhook setup, step 8) |
| `OPENAI_API_KEY` | optional |
| `MCP_SHARED_SECRET` | optional — any random string |
| `BUYER_MANDATE_PRIVATE_KEY_B64` | optional — demo keys work locally |
| `BUYER_MANDATE_PUBLIC_KEY_B64` | optional |

Push latest code to GitHub `master` before deploying.

---

## Path A — GitHub deploy (fastest, no Docker)

### 1. Create a resource group

1. Portal → **Create a resource**
2. Search **Resource group** → Create
3. Name: `rg-circuit-u402`
4. Region: **Central India**
5. Create

### 2. Create App Service plan

1. **Create a resource** → search **App Service plan**
2. Name: `plan-circuit-u402`
3. OS: **Linux**
4. Region: **Central India**
5. Pricing: **Basic B1** (cheapest always-on tier)
6. Create

### 3. Create the Web App

1. **Create a resource** → search **Web App**
2. Name: `circuit-u402` (must be globally unique → becomes `circuit-u402.azurewebsites.net`)
3. Publish: **Code**
4. Runtime stack: **Node 20 LTS**
5. OS: **Linux**
6. Region: **Central India**
7. App Service plan: `plan-circuit-u402`
8. Create (wait ~1 min)

### 4. Application settings (env vars)

Web App → **Settings** → **Environment variables** → **App settings** tab → add:

| Name | Value |
|---|---|
| `DATA_DIR` | `/home/data` |
| `RAZORPAY_KEY_ID` | your test key |
| `RAZORPAY_KEY_SECRET` | your secret |
| `RAZORPAY_WEBHOOK_SECRET` | set after step 8 |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |

Add optional keys if you use them: `OPENAI_API_KEY`, `MCP_SHARED_SECRET`, mandate keys.

Apply → **Confirm**.

### 5. Always On + startup

**Configuration** → **General settings**:

- **Always on:** On
- **Startup Command:** `npm run start`

Save.

### 6. Deploy from GitHub

Web App → **Deployment Center**:

1. Source: **GitHub**
2. Authorize GitHub if prompted
3. Org: `RishiMaddi1`, repo: `hack-1`, branch: `master`
4. Build provider: **GitHub Actions** (recommended) or App Service build service
5. Save — first deploy takes 5–10 min

Watch **Deployment Center → Logs** until success.

### 7. Smoke test

Open `https://circuit-u402.azurewebsites.net` (your actual name):

- [ ] Landing loads
- [ ] `/shop` → register → set budget → add item → pay (test card `4111…`)
- [ ] `/audit` shows paid event + hash chain
- [ ] `/api/mcp` responds (GET may return MCP info)

---

## Path B — Docker (more reliable for Next.js)

Use if Path A build fails on Azure.

### Extra resources

1. **Container registry** → Create → name `circuitu402acr`, Basic tier, same region
2. ACR → **Access keys** → enable Admin user → copy login server, username, password
3. Recreate Web App or change to **Docker Container**:
   - Image: `circuitu402acr.azurecr.io/circuit-u402:latest`
   - Continuous deployment from ACR optional

### Build and push (from your PC)

```powershell
cd C:\Users\maddi\Documents\razorpay
az login
az acr login --name circuitu402acr
docker build -t circuitu402acr.azurecr.io/circuit-u402:latest .
docker push circuitu402acr.azurecr.io/circuit-u402:latest
```

Web App → **Deployment Center** → Container settings → point at the image.

Same env vars as Path A (`DATA_DIR=/home/data`, Razorpay keys, etc.).

---

## 8. Razorpay webhook (after URL is live)

Razorpay Dashboard → **Test mode** → **Webhooks**:

- URL: `https://<your-app>.azurewebsites.net/api/webhooks/razorpay`
- Events: `payment.captured`, `payment.failed`, `order.paid` (or all payment events)
- Copy **Webhook secret** → add as `RAZORPAY_WEBHOOK_SECRET` in Azure app settings

---

## 9. MCP for judges

Hosted MCP URL (no local dev):

```
https://<your-app>.azurewebsites.net/api/mcp
```

Discovery:

```
https://<your-app>.azurewebsites.net/.well-known/agent-commerce.json
```

Update landing page demo copy if the URL differs from ngrok.

---

## 10. Later — abandoned cart email (optional)

After deploy works:

1. Create **Azure Function** (Timer trigger, e.g. hourly)
2. Function calls `POST https://<app>/api/cron/abandoned-cart` with header `Authorization: Bearer <CRON_SECRET>`
3. Add Resend API key when that route exists

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App shows default Azure page | Wait for deploy; check Deployment Center logs |
| 502 / app won't start | Check Log stream; verify `npm run build` succeeded |
| Data resets | Confirm `DATA_DIR=/home/data` is set |
| Razorpay order fails | Verify test keys in app settings (not `.env.local` on server) |
| Webhook not firing | Public URL + correct secret; test from Razorpay dashboard |

**Logs:** Web App → **Monitoring** → **Log stream**
