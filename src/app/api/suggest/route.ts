import { NextResponse, type NextRequest } from "next/server";
import { requireActor } from "@/server/auth/actor";
import { suggestFor } from "@/server/services/transactions";

export const dynamic = "force-dynamic";

/** GET /api/suggest?q=vitorino → { categoryId, accountId, projectId } ou null. */
export async function GET(request: NextRequest) {
  try {
    await requireActor();
  } catch {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const q = request.nextUrl.searchParams.get("q")?.slice(0, 120) ?? "";
  return NextResponse.json(await suggestFor(q), { headers: { "Cache-Control": "no-store" } });
}
