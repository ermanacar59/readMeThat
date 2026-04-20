import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseDocument, parseTextInput } from "@doc2speech/document-core";
import { detectLanguage } from "@doc2speech/lang-core";
import { SummaryMode, summarizeText } from "@doc2speech/summary-core";
import { createTranslationProvider } from "@doc2speech/translation-core";
import { createServerTtsProvider } from "@doc2speech/tts-core/server";
import {
  PlaybackConfigRequest,
  SpeechTonePreset,
  SpeechSynthesisRequest,
  SUPPORTED_LANGUAGES,
  TranslateTextRequest,
  getLanguageLabel,
  stripWhitespace
} from "@doc2speech/shared";

const textSchema = z.object({
  text: z.string().min(1, "Text is required."),
  sourceName: z.string().optional()
});

const detectSchema = z.object({
  text: z.string().min(1, "Text is required.")
});

const summarizeSchema = z.object({
  text: z.string().min(1, "Text is required."),
  mode: z.enum(["short", "medium", "detailed"]).default("medium"),
  language: z.string().optional()
});

const translateSchema = z.object({
  text: z.string().min(1, "Text is required."),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().min(2, "Target language is required.")
});

const playbackSchema = z.object({
  textLength: z.number().int().positive(),
  languageMode: z.enum(["auto", "manual"]),
  detectedLanguage: z.string().optional(),
  selectedLanguage: z.string().optional(),
  voiceId: z.string().optional(),
  tonePreset: z.enum(["warm", "neutral", "narrator"]).optional()
});

export async function registerRoutes(app: FastifyInstance) {
  const translationProvider = createTranslationProvider();
  const ttsProvider = createServerTtsProvider();

  app.post("/api/documents/parse", async (request, reply) => {
    const contentType = request.headers["content-type"] ?? "";

    if (contentType.includes("multipart/form-data")) {
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: "No file uploaded." });
      }
      const buffer = await file.toBuffer();
      const parsed = await parseDocument({
        buffer,
        filename: file.filename,
        mimeType: file.mimetype
      });
      return { document: parsed };
    }

    const body = textSchema.parse(request.body);
    const parsed = await parseTextInput(body.text, body.sourceName);
    return { document: parsed };
  });

  app.post("/api/language/detect", async (request) => {
    const body = detectSchema.parse(request.body);
    return detectLanguage(stripWhitespace(body.text));
  });

  app.post("/api/documents/summarize", async (request) => {
    const body = summarizeSchema.parse(request.body);
    const summary = summarizeText({
      text: body.text,
      mode: body.mode as SummaryMode,
      language: body.language
    });
    return summary;
  });

  app.post("/api/translation/translate", async (request) => {
    const body = translateSchema.parse(request.body) as TranslateTextRequest;
    return translationProvider.translate({
      text: body.text,
      sourceLanguage: body.sourceLanguage,
      targetLanguage: body.targetLanguage
    });
  });

  app.get("/api/translation/status", async () => {
    return translationProvider.getStatus();
  });

  app.get("/api/voices", async () => ({
    ...(await ttsProvider.getVoicesMetadata()),
    supportedLanguages: SUPPORTED_LANGUAGES
  }));

  app.get("/api/speech/status", async () => {
    return ttsProvider.getStatus();
  });

  app.post("/api/speech/playback-config", async (request) => {
    const body = playbackSchema.parse(request.body) as PlaybackConfigRequest;
    const provider = process.env.OPENAI_API_KEY ? "openai" : "disabled";
    const resolvedLanguage =
      body.languageMode === "manual"
        ? body.selectedLanguage || "en"
        : body.detectedLanguage || "en";
    const fallbackVoice = resolvedLanguage.toLowerCase().startsWith("tr") ? "marin" : "cedar";
    const resolvedVoiceId = body.voiceId || fallbackVoice;

    return {
      provider,
      resolvedLanguage,
      voiceId: resolvedVoiceId,
      tonePreset: (body.tonePreset || "narrator") as SpeechTonePreset,
      chunkingRecommended: body.textLength > 4000,
      message: `Playback is configured for ${getLanguageLabel(resolvedLanguage)} with ${resolvedVoiceId}.`
    };
  });

  app.post("/api/speech/synthesize", async (request, reply) => {
    const body = playbackSchema
      .extend({
        text: z.string().min(1, "Text is required.")
      })
      .parse(request.body) as SpeechSynthesisRequest & { text: string };

    const resolvedLanguage =
      body.languageMode === "manual"
        ? body.selectedLanguage || "en"
        : body.detectedLanguage || "en";

    const result = await ttsProvider.synthesize({
      text: body.text,
      language: resolvedLanguage,
      voiceId: body.voiceId,
      tonePreset: body.tonePreset,
      responseFormat: "mp3"
    });

    reply.header("Content-Type", result.contentType);
    reply.header("X-TTS-Provider", result.provider);
    reply.header("X-TTS-Voice", result.voiceId);
    reply.header("X-TTS-Model", result.model);
    return reply.send(result.audio);
  });
}
