/**
 * APEX -- /api/notify
 * Delivers Pushover notifications for leadership-critical alerts.
 * Sprint 1: Infrastructure only. Rules added in Sprint 3.
 * ADR Reference: ADR-006 (focus mode with leadership override)
 *
 * Priority levels:
 * -2 = lowest, -1 = low, 0 = normal, 1 = high, 2 = emergency (requires acknowledgement)
 * Leadership triggers use priority 1 (bypasses quiet hours)
 */

const https = require('https');
const { setCORSHeaders, parseBody, handleOptions, sendError, sendJSON } = require('./_utils');

function sendPushover(message, title, priority, url, urlTitle) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams({
      token: process.env.PUSHOVER_API_TOKEN,
      user: process.env.PUSHOVER_USER_KEY,
      message,
      title: title || 'Apex',
      priority: String(priority || 0),
      ...(url && { url }),
      ...(urlTitle && { url_title: urlTitle }),
    }).toString();

    const options = {
      hostname: 'api.pushover.net',
      path: '/1/messages.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (e) {
          reject(new Error('Failed to parse Pushover response'));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  try {
    const body = await parseBody(req);
    const { message, title, priority = 0, url, urlTitle } = body;

    if (!message) return sendError(res, 400, 'message required');

    if (!process.env.PUSHOVER_API_TOKEN || !process.env.PUSHOVER_USER_KEY) {
      return sendError(res, 500, 'Pushover credentials not configured');
    }

    const { status, data } = await sendPushover(message, title, priority, url, urlTitle);
    sendJSON(res, status, data);
  } catch (err) {
    console.error('Notify error:', err);
    sendError(res, 500, err.message);
  }
};
