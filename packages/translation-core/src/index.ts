import { getLanguageLabel, stripWhitespace } from "@doc2speech/shared";

export type TranslationProviderMode = "disabled" | "libretranslate";

export type TranslateTextRequest = {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
};

export type TranslateTextResult = {
  provider: TranslationProviderMode;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceLabel: string;
  targetLabel: string;
  message: string;
};

export type TranslationStatus = {
  provider: TranslationProviderMode;
  configured: boolean;
  reachable: boolean;
  baseUrl?: string;
  message: string;
};

export interface TranslationProvider {
  translate(input: TranslateTextRequest): Promise<TranslateTextResult>;
  getStatus(): Promise<TranslationStatus>;
}

type LibreTranslateOptions = {
  baseUrl: string;
  apiKey?: string;
};

export class DisabledTranslationProvider implements TranslationProvider {
  async translate(input: TranslateTextRequest): Promise<TranslateTextResult> {
    const sourceLanguage = input.sourceLanguage || "auto";

    if (sourceLanguage === input.targetLanguage) {
      return {
        provider: "disabled",
        translatedText: stripWhitespace(input.text),
        sourceLanguage,
        targetLanguage: input.targetLanguage,
        sourceLabel: getLanguageLabel(sourceLanguage),
        targetLabel: getLanguageLabel(input.targetLanguage),
        message: "Source and target languages already match."
      };
    }

    throw new Error("Translation provider is not configured yet. Add a LibreTranslate-compatible endpoint to enable translation before playback.");
  }

  async getStatus(): Promise<TranslationStatus> {
    return {
      provider: "disabled",
      configured: false,
      reachable: false,
      message: "LibreTranslate endpoint is not configured."
    };
  }
}

export class LibreTranslateProvider implements TranslationProvider {
  constructor(private readonly options: LibreTranslateOptions) {}

  async getStatus(): Promise<TranslationStatus> {
    try {
      const response = await fetch(new URL("/languages", this.options.baseUrl));
      if (!response.ok) {
        return {
          provider: "libretranslate",
          configured: true,
          reachable: false,
          baseUrl: this.options.baseUrl,
          message: `LibreTranslate configured but returned ${response.status}.`
        };
      }

      return {
        provider: "libretranslate",
        configured: true,
        reachable: true,
        baseUrl: this.options.baseUrl,
        message: "LibreTranslate is configured and reachable."
      };
    } catch (error) {
      return {
        provider: "libretranslate",
        configured: true,
        reachable: false,
        baseUrl: this.options.baseUrl,
        message: error instanceof Error ? error.message : "LibreTranslate is configured but unreachable."
      };
    }
  }

  async translate(input: TranslateTextRequest): Promise<TranslateTextResult> {
    const sourceLanguage = input.sourceLanguage && input.sourceLanguage !== "auto" ? input.sourceLanguage : "auto";
    const targetLanguage = input.targetLanguage;
    const text = stripWhitespace(input.text);

    if (!text) {
      throw new Error("Text is required for translation.");
    }

    if (sourceLanguage === targetLanguage) {
      return {
        provider: "libretranslate",
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        sourceLabel: getLanguageLabel(sourceLanguage),
        targetLabel: getLanguageLabel(targetLanguage),
        message: "Source and target languages already match."
      };
    }

    const response = await fetch(new URL("/translate", this.options.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: text,
        source: sourceLanguage,
        target: targetLanguage,
        format: "text",
        api_key: this.options.apiKey
      })
    });

    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      throw new Error(`Translation failed with ${response.status}. ${payload || "The translation provider returned an error."}`);
    }

    const payload = (await response.json()) as { translatedText?: string; detectedLanguage?: { language?: string } };
    const translatedText = stripWhitespace(payload.translatedText ?? "");

    if (!translatedText) {
      throw new Error("Translation provider returned an empty response.");
    }

    const resolvedSourceLanguage = sourceLanguage === "auto" ? payload.detectedLanguage?.language || "auto" : sourceLanguage;

    return {
      provider: "libretranslate",
      translatedText,
      sourceLanguage: resolvedSourceLanguage,
      targetLanguage,
      sourceLabel: getLanguageLabel(resolvedSourceLanguage),
      targetLabel: getLanguageLabel(targetLanguage),
      message: `Translated from ${getLanguageLabel(resolvedSourceLanguage)} to ${getLanguageLabel(targetLanguage)}.`
    };
  }
}

export function createTranslationProvider(): TranslationProvider {
  const baseUrl = process.env.LIBRETRANSLATE_URL;

  if (!baseUrl) {
    return new DisabledTranslationProvider();
  }

  return new LibreTranslateProvider({
    baseUrl,
    apiKey: process.env.LIBRETRANSLATE_API_KEY
  });
}
