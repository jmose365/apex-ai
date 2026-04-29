const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      const { message, title = 'Apex', priority = 0, url, urlTitle } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!message) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'message required' })); }
      if (!process.env.PUSHOVER_API_TOKEN || !process.env.PUSHOVER_USER_KEY) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Pushover not configured' }));
      }

      const payload = new URLSearchParams({
        token: process.env.PUSHOVER_API_TOKEN,
        user: process.env.PUSHOVER_USER_KEY,
        message, title, priority: String(priority),
        ...(url && { url }),
        ...(urlTitle && { url_title: urlTitle }),
      }).toString();

      const result = await new Promise((resolve, reject) => {
        const r = https.request({
          hostname: 'api.pushover.net',
          path: '/1/messages.json',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) },
        }, res2 => {
          const chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => resolve({ status: res2.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }));
        });
        r.on('error', reject);
        r.write(payload);
        r.end();
      });

      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
};
