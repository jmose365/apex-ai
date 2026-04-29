const https = require('https');

const ALLOWED_ORIGINS = [
  'https://jmose365.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

function setCORS(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function callAnthropic(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { reject(new Error('Failed to parse Anthropic response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleHealth(req, res) {
  json(res, 200, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      anthropicKey: !!process.env.ANTHROPIC_API_KEY,
      pushoverToken: !!process.env.PUSHOVER_API_TOKEN,
      pushoverUser: !!process.env.PUSHOVER_USER_KEY,
    },
  });
}

async function handleChat(req, res) {
  const { messages, system, max_tokens = 2048 } = await parseBody(req);
  if (!messages) return json(res, 400, { error: 'messages required' });
  const { status, data } = await callAnthropic({
    model: 'claude-opus-4-5',
    max_tokens,
    messages,
    ...(system && { system }),
  });
  json(res, status, data);
}

async function handleVision(req, res) {
  const { imageData, mediaType = 'image/jpeg', extractionContext = 'general' } = await parseBody(req);
  if (!imageData) return json(res, 400, { error: 'imageData required' });

  const prompts = {
    general: `Extract structured information from this image for Apex, an AI chief of staff app. Return ONLY valid JSON: { "contentType": "email|meeting|project|whiteboard|contact|document|other", "summary": "", "keyPoints": [], "actionItems": [], "people": [], "dates": [], "projectHints": [], "rawText": "", "confidence": 0.0 }`,
    email: `Extract email data. Return ONLY valid JSON: { "contentType": "email", "sender": { "name": "", "email": "" }, "subject": "", "date": "", "keyPoints": [], "asks": [], "deadlines": [], "commitments": [], "projectHints": [], "suggestedActions": [], "priority": "high|medium|low", "confidence": 0.0 }`,
    meeting: `Extract meeting data. Return ONLY valid JSON: { "contentType": "meeting", "title": "", "date": "", "time": "", "duration": "", "attendees": [], "agenda": [], "actionItems": [], "decisions": [], "commitments": [], "followUps": [], "confidence": 0.0 }`,
    project: `Extract project data. Return ONLY valid JSON: { "contentType": "project", "name": "", "goal": "", "stakeholders": [], "timeline": { "start": null, "end": null }, "phases": [], "nextActions": [], "blockers": [], "priority": "high|medium|low", "confidence": 0.0 }`,
  };

  const { status, data } = await callAnthropic({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: prompts[extractionContext] || prompts.general,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
        { type: 'text', text: 'Extract all information from this image and return structured JSON.' },
      ],
    }],
  });

  if (status === 200 && data.content && data.content[0]) {
    const raw = data.content[0].text;
    try {
      const extracted = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
      return json(res, 200, { success: true, extracted, rawResponse: raw });
    } catch {
      return json(res, 200, { success: true, extracted: null, rawResponse: raw });
    }
  }
  json(res, status, data);
}

async function handleTranscribe(req, res) {
  const { transcript, context = 'general' } = await parseBody(req);
  if (!transcript) return json(res, 400, { error: 'transcript required' });

  const { status, data } = await callAnthropic({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    system: `Process voice input for Apex, an AI chief of staff. Return ONLY valid JSON: { "contentType": "voice", "intent": "capture_task|capture_commitment|capture_project|capture_note|ask_question|other", "summary": "", "actionItems": [], "commitments": [], "people": [], "dates": [], "projectHints": [], "suggestedDestination": "project|commitment|calendar|note|chat", "confidence": 0.0 }`,
    messages: [{ role: 'user', content: `Voice input: "${transcript}"\nContext: ${context}` }],
  });

  if (status === 200 && data.content && data.content[0]) {
    const raw = data.content[0].text;
    try {
      const structured = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
      return json(res, 200, { success: true, structured, rawResponse: raw });
    } catch {
      return json(res, 200, { success: true, structured: null, rawResponse: raw });
    }
  }
  json(res, status, data);
}

async function handleNotify(req, res) {
  const { message, title = 'Apex', priority = 0, url, urlTitle } = await parseBody(req);
  if (!message) return json(res, 400, { error: 'message required' });
  if (!process.env.PUSHOVER_API_TOKEN || !process.env.PUSHOVER_USER_KEY) {
    return json(res, 500, { error: 'Pushover not configured' });
  }

  const payload = new URLSearchParams({
    token: process.env.PUSHOVER_API_TOKEN,
    user: process.env.PUSHOVER_USER_KEY,
    message, title,
    priority: String(priority),
    ...(url && { url }),
    ...(urlTitle && { url_title: urlTitle }),
  }).toString();

  const result = await new Promise((resolve, reject) => {
    const r = https.request({
      hostname: 'api.pushover.net',
      path: '/1/messages.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res2 => {
      const chunks = [];
      res2.on('data', c => chunks.push(c));
      res2.on('end', () => resolve({
        status: res2.statusCode,
        data: JSON.parse(Buffer.concat(chunks).toString()),
      }));
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });

  json(res, result.status, result.data);
}

module.exports = async (req, res) => {
  setCORS(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // In Vercel serverless, req.url is relative to the function
  // The rewrite strips /api/ prefix, so we check both forms
  const rawUrl = req.url || '';
  const url = rawUrl.split('?')[0].replace(/^\/api/, '');

  console.log('Request URL:', rawUrl, 'Parsed route:', url);

  try {
    if (url === '/health' || url === '' || url === '/') return await handleHealth(req, res);
    if (url === '/chat') return await handleChat(req, res);
    if (url === '/vision') return await handleVision(req, res);
    if (url === '/transcribe') return await handleTranscribe(req, res);
    if (url === '/notify') return await handleNotify(req, res);

    // Fallback: return health for any unmatched route so we can debug
    json(res, 200, { status: 'reached index.js', url: rawUrl, parsed: url });
  } catch (err) {
    console.error('Apex error:', err);
    json(res, 500, { error: err.message });
  }
};
