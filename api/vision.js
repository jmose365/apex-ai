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
      const { imageData, mediaType = 'image/jpeg', extractionContext = 'general' } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!imageData) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'imageData required' })); }

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
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
          { type: 'text', text: 'Extract all information from this image and return structured JSON.' },
        ]}],
      });

      if (status === 200 && data.content && data.content[0]) {
        const raw = data.content[0].text;
        try {
          const extracted = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, extracted, rawResponse: raw }));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, extracted: null, rawResponse: raw }));
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
