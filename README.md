# Apex 
Adaptive. Priority. Execution. 
“Built for how leaders actually think”
## Sprint 1 Deployment Guide

---

## What's in this repo

| File | Purpose |
|---|---|
| `index.html` | Full PWA frontend — Sprint 1 |
| `proxy.js` | Vercel backend — Anthropic API + Pushover |
| `vercel.json` | Vercel routing configuration |
| `package.json` | Node.js project config |
| `manifest.json` | PWA manifest for home screen install |

---

## Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Apex Sprint 1 — Foundation"
git branch -M main
git remote add origin https://github.com/jmose365/apex-ai.git
git push -u origin main
```

---

## Step 2: Enable GitHub Pages

1. Go to `github.com/jmose365/apex-ai`
2. Click **Settings** → **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Select **main** branch, **/ (root)** folder
5. Click **Save**

Your app will be live at: `https://jmose365.github.io/apex-ai`

---

## Step 3: Deploy Backend to Vercel

1. Go to `vercel.com` and sign in
2. Click **Add New Project**
3. Import your `jmose365/apex-ai` GitHub repo
4. Vercel will auto-detect the configuration from `vercel.json`
5. Click **Deploy**

---

## Step 4: Add Environment Variables in Vercel

In your Vercel project dashboard → **Settings** → **Environment Variables**, add:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `PUSHOVER_API_TOKEN` | Your Pushover app token |
| `PUSHOVER_USER_KEY` | Your Pushover user key |

After adding variables, go to **Deployments** and click **Redeploy** to apply them.

---

## Step 5: Update API_BASE in index.html

Once your Vercel deployment is live, copy your Vercel URL (e.g. `https://apex-ai-xyz.vercel.app`) and update this line in `index.html`:

```javascript
const CONFIG = {
  API_BASE: 'https://YOUR-VERCEL-URL.vercel.app',  // ← Update this
  ...
};
```

Commit and push. GitHub Pages will update automatically.

---

## Step 6: Test the Health Check

Visit: `https://YOUR-VERCEL-URL.vercel.app/api/health`

You should see:
```json
{
  "status": "ok",
  "environment": {
    "anthropicKey": true,
    "pushoverToken": true,
    "pushoverUser": true
  }
}
```

If any show `false`, check your environment variables in Vercel.

---

## Sprint 1 Test Checklist

Use this to verify Sprint 1 is working before moving to Sprint 2.

### Capture Engine
- [ ] Photo capture opens camera on iPhone
- [ ] Uploaded screenshot is processed and extraction shown in confirm sheet
- [ ] Voice input records, transcribes, and shows confirm sheet
- [ ] Manual entry opens confirm sheet with editable fields
- [ ] Confirm sheet shows edit capability for every field
- [ ] Cancel clears the capture with nothing saved
- [ ] Confirm saves to Recent Captures list

### Command Briefing
- [ ] Greeting updates correctly by time of day
- [ ] Date displays correctly
- [ ] Portfolio health bars render (green/yellow/red/gray)
- [ ] Accordion expands on tap without navigating away
- [ ] Refresh generates a new AI briefing
- [ ] Empty state shows when no projects exist

### Navigation
- [ ] Swipe left/right moves between screens
- [ ] Nav dots update on swipe
- [ ] Hamburger opens drawer
- [ ] Drawer items navigate to correct screens
- [ ] Backdrop tap closes drawer

### Focus Mode
- [ ] Focus pill activates modal
- [ ] Timer presets update display
- [ ] Start Focus begins countdown
- [ ] Focus pill shows active state
- [ ] Drawer toggle reflects focus state
- [ ] Toggle off ends focus mode

### Chat
- [ ] Messages send and receive correctly
- [ ] Apex responses include "Why this matters"
- [ ] Typing indicator shows while waiting
- [ ] Chat input shows only on chat screen

### Pushover
- [ ] `/api/health` shows pushoverToken and pushoverUser as true
- [ ] Test notification sends via Pushover (use browser console: `sendPushoverAlert('Test from Apex')`)

---

## Add Icons (Optional but recommended for PWA install)

Create two PNG icons and add to repo root:
- `icon-192.png` — 192×192px
- `icon-512.png` — 512×512px

These enable proper home screen icons when installed as a PWA on iPhone.

---

## Architecture Notes for AI Coding Agents

Before making any changes to this codebase, read:
- `02-apex-sprint-architecture-map.md` — component dependencies and test criteria
- `03-apex-adr-log.md` — every architectural decision and why it was made

Key rules:
- `proxy.js` never stores data — it is a stateless proxy only
- All state lives in `localStorage` via the `DB` object in `index.html`
- Every capture must go through the confirmation sheet before saving (ADR-003)
- Focus mode queue and Pushover rules expand in Sprint 3 — do not add rule logic to Sprint 1

---

## Vercel + GitHub Pages Architecture

```
iPhone (GitHub Pages)          Vercel Backend
index.html  ──────────────────►  proxy.js
                  /api/chat         │── Anthropic Claude API
                  /api/vision       │── Claude Vision (OCR)
                  /api/transcribe   │── Claude Transcription
                  /api/notify       └── Pushover
```

GitHub Pages hosts the frontend (free, fast CDN).
Vercel hosts the backend proxy (keeps API keys off the client).
