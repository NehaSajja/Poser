import { NextResponse } from "next/server";
import { connections, saveConnections, listRuns, createRun, readRun, runStage, getAsset } from "@/lib/server";
import {findArtworks,readArtworks} from "@/lib/artworks";
import { sameOrigin } from "@/lib/validation";
import type { Stage } from "@/lib/defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { path: parts } = await context.params;
    if (parts[0] === "connections") return NextResponse.json(await connections());
    if (parts[0] === "runs" && !parts[1]) return NextResponse.json(await listRuns());
    if (parts[0] === "runs" && parts[2] === "artworks") return NextResponse.json(await readArtworks(parts[1],new URL(request.url).searchParams.get("key")||"base"));
    if (parts[0] === "runs" && parts[1]) return NextResponse.json(await readRun(parts[1]));
    if (parts[0] === "assets" && parts.length === 3) {
      const buffer = await getAsset(parts[1], parts[2]);
      const type = parts[2].endsWith(".glb") ? "model/gltf-binary" : parts[2].endsWith(".json") ? "application/json" : parts[2].endsWith(".jpg") ? "image/jpeg" : parts[2].endsWith(".webp") ? "image/webp" : "image/png";
      return new Response(new Uint8Array(buffer), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "This local item could not be opened." }, { status: 404 });
  }
}
export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 38_000_000) throw new Error("Upload is too large.");
    const { path: parts } = await context.params;
    const input = await request.json();
    if (parts[0] === "connections") return NextResponse.json(await saveConnections(input));
    if (parts[0] === "runs" && !parts[1]) return NextResponse.json(await createRun(input));
    if (parts[0] === "runs" && parts[2] === "artworks") return NextResponse.json(await findArtworks(parts[1],input));
    if (parts[0] === "runs" && parts[2] === "stage") return NextResponse.json(await runStage(parts[1], input.stage as Stage));
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "This request could not be completed." }, { status: 400 });
  }
}
