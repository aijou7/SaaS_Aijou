import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { knowledgeContentMaxChars, knowledgeImportMaxBytes } from "@/lib/knowledge-limits";

export type ExtractedKnowledgeFile = {
  content: string;
  extractor: "plain-text" | "pdf" | "docx";
  metadata: Record<string, string | number | boolean | null>;
};

export async function extractKnowledgeFile(file: File): Promise<ExtractedKnowledgeFile> {
  if (file.size <= 0) throw new Error("File kosong.");
  if (file.size > knowledgeImportMaxBytes) {
    throw new Error(
      `File terlalu besar. Maksimal ${Math.round(knowledgeImportMaxBytes / 1024 / 1024)} MB per import.`,
    );
  }

  const filename = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();
  let extracted: ExtractedKnowledgeFile;

  if (
    mimeType.startsWith("text/") ||
    filename.endsWith(".txt") ||
    filename.endsWith(".md") ||
    filename.endsWith(".csv")
  ) {
    extracted = { content: await file.text(), extractor: "plain-text", metadata: {} };
  } else if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    extracted = await extractPdf(file);
  } else if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
    extracted = {
      content: result.value,
      extractor: "docx",
      metadata: { warnings: result.messages.length },
    };
  } else if (/^image\//.test(mimeType) || /\.(?:jpe?g|png|webp)$/.test(filename)) {
    throw new Error(
      "OCR gambar belum diaktifkan karena membutuhkan persetujuan pengiriman ke provider AI. Gunakan PDF/DOCX atau paste teks dulu.",
    );
  } else {
    throw new Error("Format belum didukung. Gunakan PDF, DOCX, TXT, MD, atau CSV.");
  }

  const content = normalizeExtractedText(extracted.content);
  if (!content) throw new Error("Tidak ada teks yang berhasil dibaca dari file ini.");

  return {
    ...extracted,
    content: content.slice(0, knowledgeContentMaxChars),
    metadata: {
      ...extracted.metadata,
      fileName: file.name.slice(0, 255),
      mimeType: file.type || null,
      fileSize: file.size,
      truncated: content.length > knowledgeContentMaxChars,
    },
  };
}

async function extractPdf(file: File): Promise<ExtractedKnowledgeFile> {
  const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const result = await parser.getText();
    return { content: result.text, extractor: "pdf", metadata: { pages: result.total } };
  } finally {
    await parser.destroy();
  }
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}
