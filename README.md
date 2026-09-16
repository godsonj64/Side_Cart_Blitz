# CartSide Blitz

A Manifest V3 Chrome extension + Node.js backend that turns shopping clicks into a gentle budget side panel. Product cards are captured from common product metadata/JSON-LD, budget totals separate **Considering** from **Bought**, and **Let's Talk** opens an in-panel two-agent room backed by OpenRouter:

- **Mom** guards the wallet and pushes back on unnecessary impulse purchases without shaming.
- **Bestie** keeps user-entered upcoming bills in view and helps fit purchases around them.

## Why the chat is an internal sliding panel

Chrome gives an extension one side-panel surface. CartSide uses that native side panel for the app, then slides a second view over it for chat. Visually it behaves like a second panel while staying reliable across Chrome versions.

## 1. Run locally in VS Code / Dev Container

1. Open this repository in VS Code.
2. Run **Dev Containers: Reopen in Container**. Port `8787` is forwarded automatically.
3. Edit `.env` and add your OpenRouter key:

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openrouter/auto
```

4. Start the API:

```bash
npm run dev
```

5. Confirm `http://localhost:8787/health` returns JSON with `"ok": true`.

## 2. Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder.
5. Click the CartSide toolbar icon once on any normal web page to verify the side panel opens.

The extension is configured for `http://localhost:8787` by default.

## 3. Test the shopping flow

Open a product page on a shopping site and click a control whose label looks like **Add to cart**, **Add to bag**, **Buy now**, **Checkout**, **Place order**, etc.

- Add-to-cart → card appears as **Considering**.
- Buy-now / checkout → card remains uncharged, but gets a **buying now** intent chip.
- Strong order-confirm buttons → CartSide marks the matching item bought when it can do so confidently. If checkout contains several items and the match is ambiguous, it shows a small prompt asking you to mark what was actually bought.
- CartSide never cancels or delays the merchant click; it observes the click and opens alongside the page.

Generic product extraction checks JSON-LD Product data first, then Open Graph/itemprop data, then nearby DOM price elements. Merchant-specific adapters can be added later for higher accuracy.

## 4. Budget + bills

Click **Edit** on the budget card. You can set:

- monthly budget
- budget currency
- upcoming bill name, amount, and optional due date

Only items matching the selected budget currency are included in the numeric budget total. Other-currency cards remain visible.

## 5. OpenRouter agents

Click **Let's Talk**. Every user turn sends the backend:

- recent chat messages
- the current budget amount/currency
- item cards/statuses
- only the upcoming bills the user entered

The backend makes two independent OpenRouter chat-completion requests in parallel, one with the Mom system prompt and one with the Bestie system prompt. The OpenRouter API key never enters extension storage.

By default the backend uses `openrouter/auto`, which can be replaced with any OpenRouter model slug through `OPENROUTER_MODEL`.

## 6. GitHub Codespaces

The dev container forwards port `8787`. GitHub Codespaces forwarded ports are private by default.

Two workable setups:

### Option A — VS Code Desktop + Codespace

When VS Code Desktop exposes the Codespaces port on local `127.0.0.1:8787`, keep the extension URL as:

```text
http://localhost:8787
```

### Option B — browser Codespace / remote forwarded URL

1. Start `npm run dev`.
2. In the **Ports** panel, locate port `8787`.
3. If your environment permits it, make the port **Public** so the extension can reach it without the GitHub login redirect.
4. For safety, set a strong `APP_SHARED_SECRET` in `.env` before making it public.
5. Copy the forwarded URL, normally shaped like:

```text
https://YOUR-CODESPACE-8787.app.github.dev
```

6. Open the extension's **Settings** page and paste that URL plus the same shared secret.

> Codespaces can revert public ports to private after a restart. Re-check the Ports panel if the extension stops reaching the backend.

## 7. Build and run the backend as a container image

```bash
docker build -t cartside-backend .
docker run --rm \
  -p 8787:8787 \
  -e OPENROUTER_API_KEY="your_key" \
  -e OPENROUTER_MODEL="openrouter/auto" \
  -e APP_SHARED_SECRET="choose-a-long-random-secret" \
  cartside-backend
```

Or:

```bash
cp .env.example .env
# edit .env
docker compose up --build
```

If the backend runs on another host, add that host to the extension's `host_permissions` in `manifest.json` (or convert it to an optional runtime permission before store distribution), reload the extension, and set the new backend URL in Settings.

## Security notes

- Never place `OPENROUTER_API_KEY` in extension code or Chrome storage.
- `APP_SHARED_SECRET` is optional for local development but recommended for public/remote endpoints.
- The backend does not persist chat, cards, or budgets; Chrome local extension storage owns the local state.
- This MVP uses broad shopping-page content-script access so it can detect clicks across stores. Before publishing to the Chrome Web Store, reduce permissions or move store access to optional host permissions where possible.

## Known MVP limitations

A site click is not the same thing as a verified payment. CartSide deliberately treats **Buy now** as intent, not confirmed spending. Strong “Place order / Complete purchase” controls can update spending, but carts/checkouts vary widely. For production-grade “actually bought” tracking, add store-specific checkout adapters or receipt/order-confirmation parsing.

Some sites render checkout controls inside restricted/cross-origin iframes or use unusual accessibility labels; those clicks may not be detectable by a generic content script.

## Checks

```bash
npm run check
npm test
```
