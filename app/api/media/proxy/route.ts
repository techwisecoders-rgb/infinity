import { NextResponse } from "next/server";

function normalizeShareUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const driveMatch = u.hostname.includes("drive.google.com") && u.pathname.match(/\/file\/d\/([^/]+)/);
    if (driveMatch) {
      return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    }
    const driveOpenId = u.hostname.includes("drive.google.com") ? u.searchParams.get("id") : null;
    if (driveOpenId) {
      return `https://drive.google.com/uc?export=download&id=${driveOpenId}`;
    }
    if (u.hostname.includes("dropbox.com")) {
      u.searchParams.delete("dl");
      u.searchParams.set("raw", "1");
      return u.toString();
    }
    if (u.hostname === "github.com" && u.pathname.includes("/blob/")) {
      return `https://raw.githubusercontent.com${u.pathname.replace("/blob/", "/")}`;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(normalizeShareUrl(rawUrl));
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    const reqHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "image/*,video/*,audio/*,text/html;q=0.9,*/*;q=0.8",
    };
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      reqHeaders["Range"] = rangeHeader;
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: reqHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const html = await upstream.text();
      const ogMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      if (ogMatch?.[1]) {
        const resolvedImgUrl = new URL(ogMatch[1], targetUrl).toString();
        const imgRes = await fetch(resolvedImgUrl, {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*;q=0.8" },
          redirect: "follow",
        });
        if (imgRes.ok) {
          const imgType = imgRes.headers.get("content-type") || "image/jpeg";
          const buf = await imgRes.arrayBuffer();
          return new NextResponse(buf, {
            status: 200,
            headers: {
              "Content-Type": imgType,
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      }
      return NextResponse.json({ error: "URL did not resolve to media" }, { status: 415 });
    }

    const resHeaders = new Headers();
    resHeaders.set("Content-Type", contentType || "application/octet-stream");
    resHeaders.set("Cache-Control", "public, max-age=3600");
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) resHeaders.set("Accept-Ranges", acceptRanges);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) resHeaders.set("Content-Range", contentRange);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) resHeaders.set("Content-Length", contentLength);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Proxy fetch failed" }, { status: 502 });
  }
}
