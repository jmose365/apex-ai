module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      anthropicKey: !!process.env.ANTHROPIC_API_KEY,
      pushoverToken: !!process.env.PUSHOVER_API_TOKEN,
      pushoverUser: !!process.env.PUSHOVER_USER_KEY,
    },
  }));
};
