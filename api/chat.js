/**
 * APEX -- /api/chat
 * Handles all Claude conversations: strategic advice, drafting,
 * project reasoning, and the Why This Matters engine.
 * Sprint 1: Foundation
 */

const { setCORSHeaders, parseBody, callAnthropic, handleOptions, sendError, sendJSON } = require('./_utils');

module.exports = async (req, res) => {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  try {
    const body = await parseBody(req);
    const { messages, system, max_tokens = 2048 } = body;

    if (!messages || !Array.isArray(messages)) {
      return sendError(res, 400, 'messages array required');
    }

    const payload = {
      model: 'claude-opus-4-5',
      max_tokens,
      messages,
      ...(system && { system }),
    };

    const { status, data } = await callAnthropic(payload);
    sendJSON(res, status, data);
  } catch (err) {
    console.error('Chat error:', err);
    sendError(res, 500, err.message);
  }
};
