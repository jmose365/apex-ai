/**
 * APEX -- /api/vision
 * Handles image analysis for the capture engine.
 * Accepts base64 image data, returns structured extracted content.
 * Used for: email screenshots, meeting photos, whiteboard captures,
 * project briefs, business cards, napkin notes.
 * Sprint 1: Foundation
 * ADR Reference: ADR-002 (capture-first architecture)
 */

const { setCORSHeaders, parseBody, callAnthropic, handleOptions, sendError, sendJSON } = require('./_utils');

const EXTRACTION_PROMPTS = {
  email: `You are extracting structured data from an email screenshot for Apex, an AI chief of staff app.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "email",
  "sender": { "name": "", "email": "" },
  "subject": "",
  "date": "",
  "keyPoints": [],
  "asks": [],
  "deadlines": [],
  "commitments": [],
  "projectHints": [],
  "suggestedActions": [],
  "priority": "high|medium|low",
  "confidence": 0.0
}
If a field cannot be determined, use null. confidence is 0.0-1.0.`,

  meeting: `You are extracting structured data from a meeting invite, calendar screenshot, or meeting notes for Apex.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "meeting",
  "title": "",
  "date": "",
  "time": "",
  "duration": "",
  "location": "",
  "attendees": [],
  "agenda": [],
  "actionItems": [],
  "decisions": [],
  "commitments": [],
  "projectHints": [],
  "followUps": [],
  "confidence": 0.0
}
If a field cannot be determined, use null.`,

  project: `You are extracting structured project information from a document, brief, or screenshot for Apex.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "project",
  "name": "",
  "goal": "",
  "stakeholders": [],
  "timeline": { "start": null, "end": null, "milestones": [] },
  "phases": [],
  "nextActions": [],
  "blockers": [],
  "dependencies": [],
  "priority": "high|medium|low",
  "confidence": 0.0
}
If a field cannot be determined, use null.`,

  whiteboard: `You are extracting structured information from a whiteboard, handwritten notes, or napkin sketch for Apex.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "whiteboard",
  "mainTopics": [],
  "actionItems": [],
  "decisions": [],
  "questions": [],
  "people": [],
  "deadlines": [],
  "projectHints": [],
  "rawText": "",
  "confidence": 0.0
}
If a field cannot be determined, use null.`,

  contact: `You are extracting contact information from a business card or contact screenshot for Apex.
Extract and return ONLY valid JSON with this structure:
{
  "contentType": "contact",
  "name": "",
  "role": "",
  "organization": "",
  "email": "",
  "phone": "",
  "linkedin": "",
  "notes": "",
  "confidence": 0.0
}
If a field cannot be determined, use null.`,

  general: `You are extracting structured information from an image for Apex, an AI chief of staff app.
Identify the content type and extract all relevant information. Return ONLY valid JSON with this structure:
{
  "contentType": "email|meeting|project|whiteboard|contact|document|other",
  "summary": "",
  "keyPoints": [],
  "actionItems": [],
  "people": [],
  "dates": [],
  "projectHints": [],
  "rawText": "",
  "confidence": 0.0
}
If a field cannot be determined, use null.`,
};

module.exports = async (req, res) => {
  setCORSHeaders(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  try {
    const body = await parseBody(req);
    const { imageData, mediaType = 'image/jpeg', extractionContext = 'general' } = body;

    if (!imageData) return sendError(res, 400, 'imageData (base64) required');

    const systemPrompt = EXTRACTION_PROMPTS[extractionContext] || EXTRACTION_PROMPTS.general;

    const payload = {
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageData,
              },
            },
            {
              type: 'text',
              text: 'Extract all information from this image and return the structured JSON as specified. Be thorough and accurate.',
            },
          ],
        },
      ],
    };

    const { status, data } = await callAnthropic(payload);

    if (status === 200 && data.content && data.content[0]) {
      const rawText = data.content[0].text;
      try {
        const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
        const extracted = JSON.parse(cleaned);
        return sendJSON(res, 200, { success: true, extracted, rawResponse: rawText });
      } catch (e) {
        return sendJSON(res, 200, { success: true, extracted: null, rawResponse: rawText });
      }
    }

    sendJSON(res, status, data);
  } catch (err) {
    console.error('Vision error:', err);
    sendError(res, 500, err.message);
  }
};
