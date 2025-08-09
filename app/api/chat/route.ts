export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const { baseUrl, payload } = (await req.json()) as {
      baseUrl?: string
      payload: any
    }
    const url = (baseUrl || "http://127.0.0.1:1234").replace(/\/+$/, "") + "/v1/chat/completions"
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 'Authorization': `Bearer ${apiKey}` // if needed in future
      },
      body: JSON.stringify({ ...payload, stream: true }),
    })

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "")
      return new Response(text || "Upstream error", {
        status: upstream.status || 500,
        statusText: upstream.statusText || "Upstream Error",
      })
    }

    // Pass-through SSE stream
    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Transfer-Encoding": "chunked",
    })

    return new Response(upstream.body, { headers })
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Failed to proxy chat" }, { status: 500 })
  }
}
