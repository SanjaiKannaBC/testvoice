// api/generate.js
// Vercel serverless function (CommonJS style)
const endpointModel = "gemini-2.5-flash-lite"; // model chosen for flash-lite responses

// Path to the local resume file (user-uploaded). Included as reference only.
const RESUME_LOCAL_PATH = "/mnt/data/Sanjai Kanna B C.pdf";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST allowed" });
    return;
  }

  const body = req.body || {};
  const userText = (body.text || "").toString().trim();
  if (!userText) {
    return res.status(400).json({ error: "Missing text" });
  }

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GOOGLE_API_KEY environment variable" });
  }

  // Light mode detection for returning to front-end
  function detectMode(q) {
    q = (q || "").toLowerCase();
    if (q.includes("slow") || q.includes("calm")) return "slow";
    if (q.includes("energi") || q.includes("excite")) return "energetic";
    if (q.includes("how are you") || q.includes("background")) return "relaxed";
    if ((q.split(" ").length || 0) > 25) return "slow";
    return "warm";
  }

  const mode = detectMode(userText);

  // System prompt — voice-first; no resume context included (user requested "no resume context")
  const systemPrompt = `
You are Sanjai's voice interview agent. Speak naturally in short conversational sentences suitable for audio playback.
When answers are long, provide a 1-2 sentence summary first then ask if the user wants details.
Keep tone professional, warm, and concise.
Answer the user's question directly and avoid inventing facts.
`;

  // Build Gemini Flash-Lite request body
  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          { text: "User: " + userText }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 400
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${endpointModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: `LLM request failed: ${r.status}`, details: text });
    }

    const data = await r.json();

    // Extract reply text robustly
    let reply = null;
    try {
      if (data.candidates && data.candidates.length) {
        const parts = data.candidates[0].content?.parts || [];
        reply = parts.map(p => p.text || "").join(" ").trim();
      } else if (data.outputs && data.outputs.length) {
        const parts = data.outputs[0].content || [];
        reply = parts.map(p => p.text || "").join(" ").trim();
      } else if (data.message && data.message.content) {
        reply = data.message.content.map(c => c.text || "").join(" ").trim();
      }
    } catch (e) {
      // fallback
      reply = null;
    }

    reply = reply || "I didn't catch that. Could you repeat it?";

    return res.status(200).json({ reply, modeDetected: mode });

  } catch (err) {
    return res.status(500).json({ error: "Gemini request failed", details: err.toString() });
  }
};
