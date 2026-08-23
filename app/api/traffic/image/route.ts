import { jsonError } from "@/lib/api";
import { getCameraImage } from "@/lib/providers/traffic";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  try {
    const { body, contentType } = await getCameraImage(key);
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入影像", 502);
  }
}
