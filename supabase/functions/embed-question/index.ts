import { corsHeaders } from "../_shared/cors.ts";
import { isAuthenticated } from "../_shared/auth.ts";

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
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return jsonResponse({ error: "A non-empty question is required" }, 400, origin);
    }
    if (question.length > 8000) {
      return jsonResponse({ error: "Question is too long" }, 400, origin);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "OpenAI API key is not configured" }, 500, origin);
    }

    const openAIResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: question }),
    });

    if (!openAIResponse.ok) {
      console.error("OpenAI embeddings request failed with status", openAIResponse.status);
      return jsonResponse({ error: "Embedding service request failed" }, 502, origin);
    }

    const result = await openAIResponse.json();
    const embedding = result?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      return jsonResponse({ error: "Embedding service returned an invalid response" }, 502, origin);
    }

    return jsonResponse({ embedding }, 200, origin);
  } catch (error) {
    console.error("embed-question error:", error instanceof Error ? error.message : "Unknown error");
    return jsonResponse({ error: "Internal server error" }, 500, origin);
  }
});
