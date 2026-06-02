export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Secret-Key",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const secretKey = request.headers.get("X-Secret-Key");
    if (!secretKey || secretKey !== env.SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders }); }

    const { path, content, message } = body;
    if (!path || !content || !message) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: corsHeaders });
    }

    const encoded = btoa(unescape(encodeURIComponent(content)));

    const ghRes = await fetch(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "cloudflare-worker"
        },
        body: JSON.stringify({
          event_type: "push-file",
          client_payload: { path, content: encoded, message }
        })
      }
    );

    if (ghRes.status === 204) {
      return new Response(JSON.stringify({ success: true, file: path }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const err = await ghRes.text();
    return new Response(JSON.stringify({ error: "GitHub dispatch failed", details: err }), {
      status: ghRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
