const MEDIA_ORIGIN = "https://velora-vista-visuals.veloraraw.chatgpt.site";
const ALLOWED_ROOTS = new Set(["showcase", "audio", "media"]);
const ALLOWED_FILES = new Set(["velora-logo.png", "velora-logo-transparent.png"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const safePath = path.map(decodeURIComponent);
  const allowed =
    safePath.length > 0 &&
    (ALLOWED_ROOTS.has(safePath[0]) ||
      (safePath.length === 1 && ALLOWED_FILES.has(safePath[0])));

  if (!allowed || safePath.some((part) => !part || part === "." || part === "..")) {
    return new Response("Not found", { status: 404 });
  }

  const range = request.headers.get("range");
  const upstream = await fetch(
    `${MEDIA_ORIGIN}/${safePath.map(encodeURIComponent).join("/")}`,
    {
      cache: range ? "no-store" : "force-cache",
      headers: range ? { Range: range } : undefined,
    },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response("Media unavailable", { status: upstream.status || 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

  return new Response(upstream.body, { status: upstream.status, headers });
}
