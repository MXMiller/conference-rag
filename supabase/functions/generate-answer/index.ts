import { corsHeaders } from "../_shared/cors.ts";
import { isAuthenticated } from "../_shared/auth.ts";

type ContextTalk = {
  title: string;
  speaker: string;
  text: string;
};

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (origin && !("Access-Control-Allow-Origin" in corsHeaders(origin))) {
    return jsonResponse({ error: "Origin not allowed" }, 403, origin);
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  try {
    if (!await isAuthenticated(request)) {
      return jsonResponse({ error: "Unauthorized" }, 401, origin);
    }

    const body = await request.json().catch(() => null);
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    // Readiness probe: validate deployment, auth, and secret configuration
    // without making a billable OpenAI request.
    if (body?.health_check === true) {
      if (!apiKey) {
        return jsonResponse({ error: "OpenAI API key is not configured" }, 500, origin);
      }
      return jsonResponse({ ok: true }, 200, origin);
    }

    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const contextTalks = body?.context_talks;

    if (!question) {
      return jsonResponse({ error: "A non-empty question is required" }, 400, origin);
    }
    if (question.length > 8000) {
      return jsonResponse({ error: "Question is too long" }, 400, origin);
    }
    if (!Array.isArray(contextTalks) || contextTalks.length === 0 || contextTalks.length > 20) {
      return jsonResponse({ error: "Provide between 1 and 20 context talks" }, 400, origin);
    }

    const talks: ContextTalk[] = [];
    for (const talk of contextTalks) {
      if (
        !talk ||
        typeof talk.title !== "string" ||
        typeof talk.speaker !== "string" ||
        typeof talk.text !== "string" ||
        !talk.title.trim() ||
        !talk.text.trim()
      ) {
        return jsonResponse({ error: "Each talk needs title, speaker, and text fields" }, 400, origin);
      }
      talks.push({
        title: talk.title.trim().slice(0, 500),
        speaker: talk.speaker.trim().slice(0, 300),
        text: talk.text.trim(),
      });
    }

    const totalContextLength = talks.reduce((sum, talk) => sum + talk.text.length, 0);
    if (totalContextLength > 100_000) {
      return jsonResponse({ error: "The provided talk context is too long" }, 400, origin);
    }

    if (!apiKey) {
      return jsonResponse({ error: "OpenAI API key is not configured" }, 500, origin);
    }

    const context = talks.map((talk, index) =>
      `Talk ${index + 1}\nTitle: ${talk.title}\nSpeaker: ${talk.speaker}\nText:\n${talk.text}`
    ).join("\n\n---\n\n");

    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content: "You answer questions using only the supplied General Conference talk context. Be clear and helpful. Cite every talk you rely on by its exact title and speaker, for example (\"Talk Title, Speaker\"). Do not invent quotations or sources. If the context does not contain enough information to answer, say so plainly.",
          },
          {
            role: "user",
            content: `Question:\n${question}\n\nConference talk context:\n${context}`,
          },
        ],
      }),
    });

    if (!openAIResponse.ok) {
      console.error("OpenAI answer request failed with status", openAIResponse.status);
      return jsonResponse({ error: "Answer service request failed" }, 502, origin);
    }

    const result = await openAIResponse.json();
    const answer = result?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return jsonResponse({ error: "Answer service returned an invalid response" }, 502, origin);
    }

    return jsonResponse({ answer: answer.trim() }, 200, origin);
  } catch (error) {
    console.error("generate-answer error:", error instanceof Error ? error.message : "Unknown error");
    return jsonResponse({ error: "Internal server error" }, 500, origin);
  }
});
