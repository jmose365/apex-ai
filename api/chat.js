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
      const { messages, system, max_tokens = 2048 } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!messages) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'messages required' })); }
      const { status, data } = await callAnthropic({ model: 'claude-opus-4-5', max_tokens, messages, ...(system && { system }) });
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
};
