export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const baseUrl = searchParams.get("baseUrl") || "http://127.0.0.1:1234"
    const upstream = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/models`, {
      headers: {
        "Content-Type": "application/json",
      },
      // no cache to reflect local changes
      cache: "no-store" as RequestCache,
    })
    const text = await upstream.text()
    // Try parse, else pass-through text
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
    return Response.json({ error: e?.message ?? "Failed to fetch models" }, { status: 500 })
  }
}
