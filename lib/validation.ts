export function parseImage(data: unknown): { mime: string; bytes: Buffer } {
  if (typeof data !== "string" || data.length > 16_000_000) throw new Error("Choose a PNG, JPEG, or WebP image smaller than 10 MB.");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(data);
  if (!match) throw new Error("Choose a PNG, JPEG, or WebP image.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 10_000_000 || !bytes.length) throw new Error("Choose an image smaller than 10 MB.");
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isJpg = bytes[0] === 255 && bytes[1] === 216;
  const isWebp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!(match[1] === "image/png" && isPng || match[1] === "image/jpeg" && isJpg || match[1] === "image/webp" && isWebp)) throw new Error("The image file could not be read.");
  return { mime: match[1], bytes };
}
export function validId(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid experiment ID.");
  return id;
}
export function safeAssetUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !(url.hostname === "fal.media" || url.hostname.endsWith(".fal.media"))) throw new Error("The provider returned an unexpected media address.");
  return url;
}
export function sameOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw new Error("This app accepts local connections only.");
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== host) throw new Error("Cross-origin requests are not allowed.");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") throw new Error("Cross-site requests are not allowed.");
}
