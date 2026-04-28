/**
 * APEX -- /api/health
 * Health check endpoint. Verifies environment variables are set.
 * Sprint 1: Foundation
 */

const ALLOWED_ORIGINS = [
  'https://jmose365.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

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
