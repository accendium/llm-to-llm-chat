export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const { baseUrl, payload } = (await req.json()) as {
      baseUrl?: string
      payload: any
    }
    const root = (baseUrl || "http://127.0.0.1:1234").replace(/\/+$/, "")
    const wantsStream = payload?.stream === true
    const chatUrl = `${root}/v1/chat/completions`
    const completionsUrl = `${root}/v1/completions`

    // Try chat endpoint first
    let upstream = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload }),
    })

    // If chat endpoint not available, fall back to completions
    if (!upstream.ok && upstream.status === 404) {
      const prompt = Array.isArray(payload?.messages)
        ? payload.messages.map((m: any) => `${m.role}: ${m.content}`).join("\n")
        : payload?.prompt ?? ""
      upstream = await fetch(completionsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: payload?.model,
          prompt,
          temperature: payload?.temperature,
          top_p: payload?.top_p,
          max_tokens: payload?.max_tokens,
          stream: wantsStream,
        }),
      })
    }

    if (!upstream.ok || (wantsStream && !upstream.body)) {
      const text = await upstream.text().catch(() => "")
      return new Response(text || "Upstream error", {
        status: upstream.status || 500,
        statusText: upstream.statusText || "Upstream Error",
      })
    }

    if (wantsStream && upstream.body) {
      // Pass-through SSE stream
      const headers = new Headers({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Transfer-Encoding": "chunked",
      })
      return new Response(upstream.body, { headers })
    }

    // Non-streaming response passthrough
    const text = await upstream.text()
    try {
      const json = JSON.parse(text)
      return Response.json(json)
    } catch {
      return new Response(text, {
        headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
        status: upstream.status,
        statusText: upstream.statusText,
      })
    }
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed to proxy chat" }, { status: 500 })
  }
}
