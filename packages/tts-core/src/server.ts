import {
  getLanguageLabel,
  type SpeechTonePreset,
  type TtsVoiceOption,
  type VoicesResponse
} from "@doc2speech/shared";
import { pickLanguageVoice } from "./index";

export type OpenAiTtsRequest = {
  text: string;
  language: string;
  voiceId?: string;
  tonePreset?: SpeechTonePreset;
  responseFormat?: "mp3" | "wav";
};

export type OpenAiTtsResult = {
  audio: Buffer;
  contentType: string;
  filename: string;
  provider: "openai";
  voiceId: string;
  model: string;
};

export type TtsProviderStatus = {
  provider: "openai" | "disabled";
  configured: boolean;
  reachable: boolean;
  model?: string;
  message: string;
};

export interface ServerTtsProvider {
  getVoicesMetadata(): Promise<VoicesResponse>;
  getStatus(): Promise<TtsProviderStatus>;
  synthesize(request: OpenAiTtsRequest): Promise<OpenAiTtsResult>;
}

const OPENAI_VOICE_IDS = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar"
] as const;

export const OPENAI_TTS_VOICES: TtsVoiceOption[] = OPENAI_VOICE_IDS.map((voiceId) => ({
  id: voiceId,
  name: voiceId[0].toUpperCase() + voiceId.slice(1),
  provider: "openai",
  languages: ["en", "tr", "es", "fr", "de", "it", "pt", "nl", "ru", "ar", "ja", "ko", "zh"],
  recommended: voiceId === "marin" || voiceId === "cedar"
}));

const MAX_OPENAI_TTS_INPUT_LENGTH = 4096;
const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_OPENAI_TTS_VOICE = "marin";

function pickDefaultVoice(language: string): string {
  if (language.toLowerCase().startsWith("tr")) {
    return "marin";
  }

  return DEFAULT_OPENAI_TTS_VOICE;
}

function makeInstructions(language: string, tonePreset: SpeechTonePreset = "narrator"): string {
  const languageLabel = getLanguageLabel(language);

  if (language.toLowerCase().startsWith("tr")) {
    if (tonePreset === "warm") {
      return "Speak in natural Turkish with a warm, friendly, reassuring tone. Keep pacing smooth, human, and clear.";
    }

    if (tonePreset === "neutral") {
      return "Speak in clean, steady Turkish with balanced pacing, minimal drama, and clear pronunciation.";
    }

    return "Speak in polished Turkish like a professional narrator. Keep pronunciation clear, pacing smooth, and delivery calm and confident.";
  }

  if (tonePreset === "warm") {
    return `Speak naturally in ${languageLabel} with a warm, friendly, reassuring tone and smooth pacing.`;
  }

  if (tonePreset === "neutral") {
    return `Speak naturally in ${languageLabel} with balanced pacing, clean pronunciation, and a neutral delivery.`;
  }

  return `Speak naturally in ${languageLabel} with smooth pacing, clean pronunciation, and a professional narrator tone.`;
}

export class DisabledServerTtsProvider implements ServerTtsProvider {
  async getVoicesMetadata(): Promise<VoicesResponse> {
    return {
      providerMode: "disabled",
      voices: OPENAI_TTS_VOICES,
      supportedLanguages: [],
      notes: [
        "OpenAI TTS is not configured yet.",
        "Set OPENAI_API_KEY to enable high-quality generated speech."
      ],
      recommendedVoiceIds: ["marin", "cedar"]
    };
  }

  async getStatus(): Promise<TtsProviderStatus> {
    return {
      provider: "disabled",
      configured: false,
      reachable: false,
      message: "OpenAI TTS is not configured. Add OPENAI_API_KEY in .env."
    };
  }

  async synthesize(): Promise<OpenAiTtsResult> {
    throw new Error("OpenAI TTS is not configured. Add OPENAI_API_KEY in .env before playback.");
  }
}

export class OpenAiServerTtsProvider implements ServerTtsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_OPENAI_TTS_MODEL
  ) {}

  async getVoicesMetadata(): Promise<VoicesResponse> {
    return {
      providerMode: "openai",
      voices: OPENAI_TTS_VOICES,
      supportedLanguages: [],
      notes: [
        "OpenAI GPT-4o mini TTS is active.",
        "For best quality, OpenAI recommends marin or cedar.",
        "OpenAI voices are optimized for English but support Turkish and many other languages."
      ],
      recommendedVoiceIds: ["marin", "cedar"]
    };
  }

  async getStatus(): Promise<TtsProviderStatus> {
    return {
      provider: "openai",
      configured: true,
      reachable: true,
      model: this.model,
      message: `OpenAI TTS is configured with ${this.model}.`
    };
  }

  async synthesize(request: OpenAiTtsRequest): Promise<OpenAiTtsResult> {
    const text = request.text.trim();
    if (!text) {
      throw new Error("Text is required for speech generation.");
    }

    if (text.length > MAX_OPENAI_TTS_INPUT_LENGTH) {
      throw new Error(`OpenAI TTS currently supports up to ${MAX_OPENAI_TTS_INPUT_LENGTH} characters per request. Try the summary mode for long documents first.`);
    }

    const fallbackVoice = pickDefaultVoice(request.language);
    const voice = pickLanguageVoice(OPENAI_TTS_VOICES, request.language, request.voiceId)?.id ?? fallbackVoice;
    const responseFormat = request.responseFormat ?? "mp3";

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        voice,
        input: text,
        instructions: makeInstructions(request.language, request.tonePreset),
        response_format: responseFormat
      })
    });

    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      throw new Error(`OpenAI TTS failed with ${response.status}. ${payload || "The provider returned an error."}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());

    return {
      audio,
      contentType: responseFormat === "wav" ? "audio/wav" : "audio/mpeg",
      filename: `speech.${responseFormat}`,
      provider: "openai",
      voiceId: voice,
      model: this.model
    };
  }
}

export function createServerTtsProvider(): ServerTtsProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_TTS_MODEL || DEFAULT_OPENAI_TTS_MODEL;

  if (!apiKey) {
    return new DisabledServerTtsProvider();
  }

  return new OpenAiServerTtsProvider(apiKey, model);
}
