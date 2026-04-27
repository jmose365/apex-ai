/**
 * APEX — AI Chief of Staff
 * Backend Proxy — proxy.js
 * 
 * Handles:
 * - Anthropic Claude API (text, vision/OCR, audio transcription)
 * - Pushover notification delivery
 * 
 * Environment variables required in Vercel:
 * - ANTHROPIC_API_KEY
 * - PUSHOVER_API_TOKEN
 * - PUSHOVER_USER_KEY
 * 
 * Sprint: 1 (Foundation)
 * ADR References: ADR-002 (capture-first), ADR-003 (confirm before acting)
 */

const https = require("https");
const http = require("http");

// ─── CORS Headers ────────────────────────────────────────────────────────────
// Allow requests from GitHub Pages and local development
const ALLOWED_ORIGINS = [
  "https://jmose365.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

function setCORSHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ─── Request Body Parser ──────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// ─── Anthropic API Call ───────────────────────────────────────────────────────
function callAnthropic(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    };

    const apiReq = https.request(options, (apiRes) => {
      const chunks = [];
      apiRes.on("data", (chunk) => chunks.push(chunk));
      apiRes.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          resolve({ status: apiRes.statusCode, data });
        } catch (e) {
          reject(new Error("Failed to parse Anthropic response"));
        }
      });
    });

    apiReq.on("error", reject);
    apiReq.write(body);
    apiReq.end();
  });
}

// ─── Pushover Notification ────────────────────────────────────────────────────
function sendPushover(message, title = "Apex", priority = 0, url = null, urlTitle = null) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams({
      token: process.env.PUSHOVER_API_TOKEN,
      user: process.env.PUSHOVER_USER_KEY,
      message,
      title,
      priority: String(priority),
      ...(url && { url }),
      ...(urlTitle && { url_title: urlTitle }),
    }).toString();

    const options = {
      hostname: "api.pushover.net",
      path: "/1/messages.json",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          resolve({ status: res.statusCode, data });
        } catch (e) {
          reject(new Error("Failed to parse Pushover response"));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─── Route: /api/chat ─────────────────────────────────────────────────────────
// Handles all Claude conversations including strategic advice, drafting,
// project reasoning, and the Why This Matters engine.
// Accepts: { messages, system, max_tokens }
async function handleChat(req, res) {
  const body = await parseBody(req);
  const { messages, system, max_tokens = 2048 } = body;

  if (!messages || !Array.isArray(messages)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "messages array required" }));
  }

  const payload = {
    model: "claude-opus-4-5",
    max_tokens,
    messages,
    ...(system && { system }),
  };

  const { status, data } = await callAnthropic(payload);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ─── Route: /api/vision ───────────────────────────────────────────────────────
// Handles image analysis for the capture engine.
// Accepts base64 image data and returns structured extracted content.
// Used for: email screenshots, meeting photos, whiteboard captures,
// project briefs, business cards, napkin notes.
// ADR Reference: ADR-002 (capture-first architecture)
async function handleVision(req, res) {
  const body = await parseBody(req);
  const { imageData, mediaType = "image/jpeg", extractionContext = "general" } = body;

  if (!imageData) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "imageData (base64) required" }));
  }

  // Extraction prompts tailored by content context
  // Each prompt instructs Claude to return structured JSON for the confirmation flow
  const extractionPrompts = {
    email: `You are extracting structured data from an email screenshot for Apex, an AI chief of staff app.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "email",
  "sender": { "name": "", "email": "" },
  "subject": "",
  "date": "",
  "keyPoints": [],
  "asks": [],
  "deadlines": [],
  "commitments": [],
  "projectHints": [],
  "suggestedActions": [],
  "priority": "high|medium|low",
  "confidence": 0.0
}
If a field cannot be determined, use null. confidence is 0.0-1.0.`,

    meeting: `You are extracting structured data from a meeting invite, calendar screenshot, or meeting notes for Apex.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "meeting",
  "title": "",
  "date": "",
  "time": "",
  "duration": "",
  "location": "",
  "attendees": [],
  "agenda": [],
  "actionItems": [],
  "decisions": [],
  "commitments": [],
  "projectHints": [],
  "followUps": [],
  "confidence": 0.0
}
If a field cannot be determined, use null.`,

    project: `You are extracting structured project information from a document, brief, or screenshot for Apex.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "project",
  "name": "",
  "goal": "",
  "stakeholders": [],
  "timeline": { "start": null, "end": null, "milestones": [] },
  "phases": [],
  "nextActions": [],
  "blockers": [],
  "dependencies": [],
  "priority": "high|medium|low",
  "confidence": 0.0
}
If a field cannot be determined, use null.`,

    whiteboard: `You are extracting structured information from a whiteboard, handwritten notes, or napkin sketch for Apex.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "whiteboard",
  "mainTopics": [],
  "actionItems": [],
  "decisions": [],
  "questions": [],
  "people": [],
  "deadlines": [],
  "projectHints": [],
  "rawText": "",
  "confidence": 0.0
}
If a field cannot be determined, use null.`,

    contact: `You are extracting contact information from a business card or contact screenshot for Apex.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "contact",
  "name": "",
  "role": "",
  "organization": "",
  "email": "",
  "phone": "",
  "linkedin": "",
  "notes": "",
  "confidence": 0.0
}
If a field cannot be determined, use null.`,

    general: `You are extracting structured information from an image for Apex, an AI chief of staff app.
Identify the content type and extract all relevant information. Return ONLY valid JSON with this structure:
{
  "contentType": "email|meeting|project|whiteboard|contact|document|other",
  "summary": "",
  "keyPoints": [],
  "actionItems": [],
  "people": [],
  "dates": [],
  "projectHints": [],
  "rawText": "",
  "confidence": 0.0
}
If a field cannot be determined, use null.`,
  };

  const systemPrompt = extractionPrompts[extractionContext] || extractionPrompts.general;

  const payload = {
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageData,
            },
          },
          {
            type: "text",
            text: "Extract all information from this image and return the structured JSON as specified. Be thorough and accurate.",
          },
        ],
      },
    ],
  };

  const { status, data } = await callAnthropic(payload);

  // Parse Claude's response and extract the JSON
  if (status === 200 && data.content && data.content[0]) {
    const rawText = data.content[0].text;
    try {
      // Strip any markdown code fences if present
      const cleaned = rawText.replace(/```json\n?|\n?```/g, "").trim();
      const extracted = JSON.parse(cleaned);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, extracted, rawResponse: rawText }));
    } catch (e) {
      // Return raw text if JSON parsing fails
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, extracted: null, rawResponse: rawText }));
    }
  }

  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ─── Route: /api/transcribe ───────────────────────────────────────────────────
// Handles voice input transcription and structuring via Claude.
// Accepts base64 audio data or raw transcript text.
// Claude transcribes AND structures in one pass for efficiency.
// ADR Reference: ADR-002 (C — audio via Claude directly)
async function handleTranscribe(req, res) {
  const body = await parseBody(req);
  const { transcript, context = "general" } = body;

  // For Sprint 1 we accept pre-transcribed text from Web Speech API
  // and use Claude to structure and enrich it.
  // Raw audio-to-Claude will be implemented when Claude adds direct audio support.
  if (!transcript) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "transcript text required" }));
  }

  const systemPrompt = `You are processing voice input for Apex, an AI chief of staff app.
The user spoke the following text. Extract structured information and return ONLY valid JSON:
{
  "contentType": "voice",
  "intent": "capture_task|capture_commitment|capture_project|capture_note|ask_question|other",
  "summary": "",
  "actionItems": [],
  "commitments": [],
  "people": [],
  "dates": [],
  "projectHints": [],
  "suggestedDestination": "project|commitment|calendar|note|chat",
  "structuredContent": {},
  "confidence": 0.0
}
Be accurate with names, dates, and technical terms even if they seem unusual — this user works in data analytics and runs a creative studio.`;

  const payload = {
    model: "claude-opus-4-5",
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Voice input to process: "${transcript}" \n\nContext: ${context}`,
      },
    ],
  };

  const { status, data } = await callAnthropic(payload);

  if (status === 200 && data.content && data.content[0]) {
    const rawText = data.content[0].text;
    try {
      const cleaned = rawText.replace(/```json\n?|\n?```/g, "").trim();
      const structured = JSON.parse(cleaned);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, structured, rawResponse: rawText }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, structured: null, rawResponse: rawText }));
    }
  }

  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ─── Route: /api/notify ───────────────────────────────────────────────────────
// Delivers Pushover notifications for leadership-critical alerts.
// Sprint 1: infrastructure only. Rules are added in Sprint 3.
// ADR Reference: ADR-006 (focus mode with leadership override)
// Priority levels: -2 (lowest) to 2 (emergency requiring acknowledgement)
// Leadership triggers use priority 1 (high priority, bypasses quiet hours)
async function handleNotify(req, res) {
  const body = await parseBody(req);
  const { message, title, priority = 0, url, urlTitle } = body;

  if (!message) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "message required" }));
  }

  if (!process.env.PUSHOVER_API_TOKEN || !process.env.PUSHOVER_USER_KEY) {
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Pushover credentials not configured" }));
  }

  const { status, data } = await sendPushover(message, title, priority, url, urlTitle);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ─── Route: /api/health ───────────────────────────────────────────────────────
// Health check endpoint for debugging and monitoring.
async function handleHealth(req, res) {
  const checks = {
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: {
      anthropicKey: !!process.env.ANTHROPIC_API_KEY,
      pushoverToken: !!process.env.PUSHOVER_API_TOKEN,
      pushoverUser: !!process.env.PUSHOVER_USER_KEY,
    },
  };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(checks));
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  setCORSHeaders(req, res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Only accept POST for API routes (except health)
  const url = req.url.split("?")[0];

  if (url === "/api/health" && req.method === "GET") {
    return handleHealth(req, res);
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    if (url === "/api/chat") return await handleChat(req, res);
    if (url === "/api/vision") return await handleVision(req, res);
    if (url === "/api/transcribe") return await handleTranscribe(req, res);
    if (url === "/api/notify") return await handleNotify(req, res);

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Route not found" }));
  } catch (err) {
    console.error("Apex proxy error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error", detail: err.message }));
  }
};
