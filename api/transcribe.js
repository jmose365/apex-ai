/**
 * APEX -- /api/transcribe
 * Handles voice input structuring via Claude.
 * Accepts pre-transcribed text from Web Speech API,
 * Claude structures and enriches it in one pass.
 * Sprint 1: Foundation
 */

const { setCORSHeaders, parseBody, callAnthropic, handleOptions, sendError, sendJSON } = require('./_utils');

module.exports = async (req, res) => {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  try {
    const body = await parseBody(req);
    const { transcript, context = 'general' } = body;

    if (!transcript) return sendError(res, 400, 'transcript text required');

    const systemPrompt = `You are processing voice input for Apex, an AI chief of staff app.
The user spoke the following text. Extract structured information and return ONLY valid JSON:
{
  "contentType": "voice",
  "intent": "capture_task|capture_commitment|capture_project|capture_note|ask_question|other",
  "summary": "",
  "actionItems": [],
  "commitments": [],
  "people": [],
  "dates": [],
  "projectHints": [],
  "suggestedDestination": "project|commitment|calendar|note|chat",
  "structuredContent": {},
  "confidence": 0.0
}
Be accurate with names, dates, and technical terms even if they seem unusual. This user works in data analytics and runs a creative studio. They manage complex workstreams across corporate and entrepreneurial contexts.`;

    const payload = {
      model: 'claude-opus-4-5',
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Voice input to process: "${transcript}"\n\nContext: ${context}`,
        },
      ],
    };

    const { status, data } = await callAnthropic(payload);

    if (status === 200 && data.content && data.content[0]) {
      const rawText = data.content[0].text;
      try {
        const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
        const structured = JSON.parse(cleaned);
        return sendJSON(res, 200, { success: true, structured, rawResponse: rawText });
      } catch (e) {
        return sendJSON(res, 200, { success: true, structured: null, rawResponse: rawText });
      }
    }

    sendJSON(res, status, data);
  } catch (err) {
    console.error('Transcribe error:', err);
    sendError(res, 500, err.message);
  }
};
