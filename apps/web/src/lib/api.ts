import {
  DetectLanguageResponse,
  ParsedDocument,
  PlaybackConfigRequest,
  PlaybackConfigResponse,
  SpeechTonePreset,
  SpeechStatusResponse,
  SpeechSynthesisRequest,
  TtsVoiceOption,
  TranslateTextResponse,
  VoicesResponse
} from "@doc2speech/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export type SummaryMode = "short" | "medium" | "detailed";

export type SummaryResponse = {
  summary: string;
  bullets: string[];
  sentenceCount: number;
  mode: SummaryMode;
};

export type TranslationStatusResponse = {
  provider: "disabled" | "libretranslate";
  configured: boolean;
  reachable: boolean;
  baseUrl?: string;
  message: string;
};

export type SynthesizeSpeechResult = {
  audioBlob?: Blob;
  audioChunks?: Blob[];
  provider: string | null;
  voiceId: string | null;
  model: string | null;
};

const MAX_TTS_CHARS_PER_CHUNK = 3600;

export function splitTextForSpeech(text: string, maxChars = MAX_TTS_CHARS_PER_CHUNK): string[] {
  const normalized = text.trim().replace(/\r\n/g, "\n");
  if (normalized.length <= maxChars) {
    return [normalized];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentChunk = "";

  const pushCurrent = () => {
    const cleaned = currentChunk.trim();
    if (cleaned) {
      chunks.push(cleaned);
    }
    currentChunk = "";
  };

  const appendPart = (part: string) => {
    const candidate = currentChunk ? `${currentChunk}\n\n${part}` : part;
    if (candidate.length <= maxChars) {
      currentChunk = candidate;
      return;
    }

    pushCurrent();

    if (part.length <= maxChars) {
      currentChunk = part;
      return;
    }

    const sentences = part.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
    let sentenceChunk = "";

    for (const sentence of sentences) {
      const sentenceCandidate = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;
      if (sentenceCandidate.length <= maxChars) {
        sentenceChunk = sentenceCandidate;
        continue;
      }

      if (sentenceChunk) {
        chunks.push(sentenceChunk);
      }

      if (sentence.length <= maxChars) {
        sentenceChunk = sentence;
        continue;
      }

      for (let index = 0; index < sentence.length; index += maxChars) {
        chunks.push(sentence.slice(index, index + maxChars).trim());
      }
      sentenceChunk = "";
    }

    currentChunk = sentenceChunk;
  };

  for (const paragraph of paragraphs) {
    appendPart(paragraph);
  }

  pushCurrent();
  return chunks.filter(Boolean);
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(payload.message || "Request failed.");
  }
  return response.json() as Promise<T>;
}

export async function parseText(text: string, sourceName?: string): Promise<ParsedDocument> {
  const response = await fetch(`${API_BASE_URL}/documents/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, sourceName })
  });
  const payload = await unwrap<{ document: ParsedDocument }>(response);
  return payload.document;
}

export async function parseFile(file: File): Promise<ParsedDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/documents/parse`, {
    method: "POST",
    body: formData
  });
  const payload = await unwrap<{ document: ParsedDocument }>(response);
  return payload.document;
}

export async function detectDocumentLanguage(text: string): Promise<DetectLanguageResponse> {
  const response = await fetch(`${API_BASE_URL}/language/detect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });
  return unwrap<DetectLanguageResponse>(response);
}

export async function fetchVoiceMetadata(): Promise<VoicesResponse> {
  const response = await fetch(`${API_BASE_URL}/voices`);
  return unwrap<VoicesResponse>(response);
}

export async function fetchSpeechStatus(): Promise<SpeechStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/speech/status`);
  return unwrap<SpeechStatusResponse>(response);
}

export async function getPlaybackConfig(payload: PlaybackConfigRequest): Promise<PlaybackConfigResponse> {
  const response = await fetch(`${API_BASE_URL}/speech/playback-config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return unwrap<PlaybackConfigResponse>(response);
}

export async function summarizeDocument(
  text: string,
  mode: SummaryMode,
  language?: string
): Promise<SummaryResponse> {
  const response = await fetch(`${API_BASE_URL}/documents/summarize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, mode, language })
  });
  return unwrap<SummaryResponse>(response);
}

export async function synthesizeSpeech(payload: SpeechSynthesisRequest & { text: string }): Promise<SynthesizeSpeechResult> {
  const chunks = splitTextForSpeech(payload.text);
  const audioChunks: Blob[] = [];
  let provider: string | null = null;
  let voiceId: string | null = null;
  let model: string | null = null;

  for (const chunk of chunks) {
    const response = await fetch(`${API_BASE_URL}/speech/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        text: chunk,
        textLength: chunk.length
      })
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorPayload.message || "Speech synthesis failed.");
    }

    audioChunks.push(await response.blob());
    provider = response.headers.get("X-TTS-Provider");
    voiceId = response.headers.get("X-TTS-Voice");
    model = response.headers.get("X-TTS-Model");
  }

  return {
    audioBlob: audioChunks.length === 1 ? audioChunks[0] : undefined,
    audioChunks,
    provider,
    voiceId,
    model
  };
}

export async function translateDocument(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<TranslateTextResponse> {
  const response = await fetch(`${API_BASE_URL}/translation/translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, sourceLanguage, targetLanguage })
  });
  return unwrap<TranslateTextResponse>(response);
}

export async function fetchTranslationStatus(): Promise<TranslationStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/translation/status`);
  return unwrap<TranslationStatusResponse>(response);
}
