import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/server/auth/actor";
import { toAppError } from "@/server/errors";
import { confirmZakImport, previewZakImport } from "@/server/services/zak-import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;

/** POST multipart: file (.xlsx) + mode ("preview" | "confirm"). */
export async function POST(request: NextRequest) {
  try {
    await requireActor();
    const form = await request.formData();
    const file = form.get("file");
    const mode = form.get("mode");
    if (!(file instanceof File)) return NextResponse.json({ error: "Envie o arquivo da planilha." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais." }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (mode === "confirm") {
      const result = await confirmZakImport(buffer);
      for (const p of ["/", "/lancamentos", "/faturas", "/contas", "/importar"]) revalidatePath(p);
      return NextResponse.json(result);
    }
    return NextResponse.json(await previewZakImport(buffer));
  } catch (error) {
    const e = toAppError(error);
    const status = e.code === "UNAUTHENTICATED" ? 401 : e.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}
