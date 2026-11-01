import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/** Texto do PDF, com as páginas em sequência. */
export async function pdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text as string;
}
