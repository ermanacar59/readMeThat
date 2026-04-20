import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { ParsedDocument, stripWhitespace } from "@doc2speech/shared";

type ParseInput = {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
};

function inferSourceType(filename: string): ParsedDocument["sourceType"] {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "txt") return "txt";
  return "text";
}

function buildParsedDocument(sourceName: string, sourceType: ParsedDocument["sourceType"], extractedText: string): ParsedDocument {
  const normalizedText = stripWhitespace(extractedText);
  const wordCount = normalizedText ? normalizedText.split(/\s+/).length : 0;
  return {
    sourceName,
    sourceType,
    extractedText,
    normalizedText,
    characterCount: normalizedText.length,
    wordCount
  };
}

export async function parseTextInput(text: string, sourceName = "Pasted Text"): Promise<ParsedDocument> {
  return buildParsedDocument(sourceName, "text", text);
}

export async function parseDocument(input: ParseInput): Promise<ParsedDocument> {
  const sourceType = inferSourceType(input.filename);
  if (sourceType === "txt" || sourceType === "text") {
    return buildParsedDocument(input.filename, sourceType, input.buffer.toString("utf-8"));
  }
  if (sourceType === "docx") {
    const result = await mammoth.extractRawText({ buffer: input.buffer });
    return buildParsedDocument(input.filename, sourceType, result.value);
  }
  if (sourceType === "pdf") {
    const result = await pdfParse(input.buffer);
    return buildParsedDocument(input.filename, sourceType, result.text);
  }
  throw new Error(`Unsupported document type for ${input.filename}`);
}
