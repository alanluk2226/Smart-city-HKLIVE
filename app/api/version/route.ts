import { jsonOk } from "@/lib/api";
import { resolveBuildId } from "@/lib/build-id";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk(
    { buildId: resolveBuildId() },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
