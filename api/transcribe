const https = require('https');

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
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      const { transcript, context = 'general' } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!transcript) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'transcript required' })); }

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
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, structured, rawResponse: raw }));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, structured: null, rawResponse: raw }));
        }
      }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
};
