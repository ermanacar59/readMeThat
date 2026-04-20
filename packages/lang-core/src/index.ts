import { franc } from "franc";
import langs from "langs";
import { DetectLanguageResponse, getLanguageLabel } from "@doc2speech/shared";

const LANGUAGE_FALLBACK = "en";

export function detectLanguage(text: string): DetectLanguageResponse {
  const trimmed = text.trim();
  if (trimmed.length < 20) {
    return {
      detectedLanguage: LANGUAGE_FALLBACK,
      detectedLabel: getLanguageLabel(LANGUAGE_FALLBACK),
      confidence: "low"
    };
  }

  const iso3 = franc(trimmed, { minLength: 20 });
  if (iso3 === "und") {
    return {
      detectedLanguage: LANGUAGE_FALLBACK,
      detectedLabel: getLanguageLabel(LANGUAGE_FALLBACK),
      confidence: "low"
    };
  }

  const language = langs.where("3", iso3);
  const iso1 = language?.["1"] ?? LANGUAGE_FALLBACK;

  return {
    detectedLanguage: iso1,
    detectedLabel: getLanguageLabel(iso1),
    confidence: trimmed.length > 200 ? "high" : "medium"
  };
}
