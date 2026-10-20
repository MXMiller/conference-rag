const allowedOrigins = new Set(
  (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "https://mxmiller.github.io,http://localhost:5500,http://127.0.0.1:5500")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}
