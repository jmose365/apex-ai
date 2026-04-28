/**
 * APEX -- /api/health
 * Health check endpoint. Verifies environment variables are set.
 * Sprint 1: Foundation
 */

const { setCORSHeaders, handleOptions, sendJSON } = require('./_utils');

module.exports = async (req, res) => {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;

  sendJSON(res, 200, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      anthropicKey: !!process.env.ANTHROPIC_API_KEY,
      pushoverToken: !!process.env.PUSHOVER_API_TOKEN,
      pushoverUser: !!process.env.PUSHOVER_USER_KEY,
    },
  });
};
