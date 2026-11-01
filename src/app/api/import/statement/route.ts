import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/server/auth/actor";
import { toAppError } from "@/server/errors";
import { pdfText } from "@/server/import/pdf-text";
import { confirmStatementText, previewStatementText } from "@/server/services/statement-import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;

/** POST multipart: file (PDF) + mode ("preview" | "confirm") + options (JSON, no confirm). */
export async function POST(request: NextRequest) {
  try {
    await requireActor();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Envie o PDF do extrato ou da fatura." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais." }, { status: 413 });
    let text: string;
    try {
      text = await pdfText(Buffer.from(await file.arrayBuffer()));
    } catch {
      return NextResponse.json({ error: "Não foi possível ler o PDF." }, { status: 400 });
    }
    if (form.get("mode") === "confirm") {
      const options = JSON.parse(String(form.get("options") ?? "{}"));
      const result = await confirmStatementText(text, options);
      for (const p of ["/", "/lancamentos", "/faturas", "/contas", "/importar"]) revalidatePath(p);
      return NextResponse.json(result);
    }
    return NextResponse.json(await previewStatementText(text));
  } catch (error) {
    const e = toAppError(error);
    return NextResponse.json({ error: e.message }, { status: e.code === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
