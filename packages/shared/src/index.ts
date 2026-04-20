export type SupportedLanguageOption = {
  code: string;
  label: string;
};

export const SUPPORTED_LANGUAGES: SupportedLanguageOption[] = [
  { code: "auto", label: "Auto Detect" },
  { code: "en", label: "English" },
  { code: "tr", label: "Turkish" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "ru", label: "Russian" },
  { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" }
];

export type DocumentKind = "text" | "txt" | "pdf" | "docx";

export type ParsedDocument = {
  sourceName: string;
  sourceType: DocumentKind;
  extractedText: string;
  normalizedText: string;
  characterCount: number;
  wordCount: number;
};

export type DetectLanguageRequest = {
  text: string;
};

export type DetectLanguageResponse = {
  detectedLanguage: string;
  detectedLabel: string;
  confidence: "low" | "medium" | "high";
};

export type ParseTextRequest = {
  text: string;
  sourceName?: string;
};

export type BrowserVoiceOption = {
  id: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
  provider: "browser-native" | "external";
};

export type TtsVoiceOption = {
  id: string;
  name: string;
  provider: "openai" | "browser-native" | "external";
  languages: string[];
  recommended?: boolean;
};

export type VoicesResponse = {
  providerMode: "browser-native" | "openai" | "disabled";
  voices: TtsVoiceOption[];
  supportedLanguages: SupportedLanguageOption[];
  notes: string[];
  recommendedVoiceIds?: string[];
};

export type PlaybackConfigRequest = {
  textLength: number;
  languageMode: "auto" | "manual";
  detectedLanguage?: string;
  selectedLanguage?: string;
  voiceId?: string;
  tonePreset?: SpeechTonePreset;
};

export type PlaybackConfigResponse = {
  provider: "browser-native" | "openai" | "disabled";
  resolvedLanguage: string;
  voiceId?: string;
  tonePreset?: SpeechTonePreset;
  chunkingRecommended: boolean;
  message: string;
};

export type SpeechTonePreset = "warm" | "neutral" | "narrator";

export type SpeechSynthesisRequest = {
  text: string;
  textLength: number;
  languageMode: "auto" | "manual";
  detectedLanguage?: string;
  selectedLanguage?: string;
  voiceId?: string;
  tonePreset?: SpeechTonePreset;
  useSummary?: boolean;
};

export type SpeechStatusResponse = {
  provider: "openai" | "disabled";
  configured: boolean;
  reachable: boolean;
  model?: string;
  message: string;
};

export type TranslateTextRequest = {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
};

export type TranslateTextResponse = {
  provider: "disabled" | "libretranslate";
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceLabel: string;
  targetLabel: string;
  message: string;
};

export function getLanguageLabel(code: string): string {
  return SUPPORTED_LANGUAGES.find((item) => item.code === code)?.label ?? code;
}

export function stripWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
