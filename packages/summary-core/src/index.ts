import { stripWhitespace } from "@doc2speech/shared";

export type SummaryMode = "short" | "medium" | "detailed";

export type SummaryRequest = {
  text: string;
  mode?: SummaryMode;
  language?: string;
};

export type SummaryResult = {
  mode: SummaryMode;
  summary: string;
  bullets: string[];
  sentenceCount: number;
};

export interface SummaryProvider {
  summarize(input: SummaryRequest): SummaryResult;
}

type RankedSentence = {
  index: number;
  score: number;
  sentence: string;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "into",
  "your",
  "have",
  "will",
  "about",
  "there",
  "they",
  "their",
  "were",
  "been",
  "would",
  "could",
  "should",
  "bir",
  "ve",
  "ile",
  "icin",
  "gibi",
  "olan",
  "daha",
  "bunu",
  "bana",
  "sana",
  "veya",
  "yani",
  "ama",
  "cok",
  "gore",
  "kadar"
]);

const MODE_SENTENCE_COUNT: Record<SummaryMode, number> = {
  short: 3,
  medium: 5,
  detailed: 8
};

function splitIntoSentences(text: string): string[] {
  return stripWhitespace(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => stripWhitespace(sentence))
    .filter((sentence) => sentence.length > 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff\s]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function buildKeywordWeights(sentences: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const sentence of sentences) {
    for (const token of tokenize(sentence)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return counts;
}

function scoreSentence(sentence: string, index: number, totalSentences: number, weights: Map<string, number>): number {
  const tokens = tokenize(sentence);
  const tokenScore = tokens.reduce((sum, token) => sum + (weights.get(token) ?? 0), 0);
  const normalizedTokenScore = tokens.length ? tokenScore / tokens.length : 0;
  const openingBonus = index === 0 ? 1.5 : 0;
  const closingBonus = index === totalSentences - 1 ? 0.5 : 0;
  const mediumLengthBonus = sentence.length >= 60 && sentence.length <= 260 ? 1 : 0;
  return normalizedTokenScore + openingBonus + closingBonus + mediumLengthBonus;
}

function uniqueBullets(sentences: string[]): string[] {
  const seen = new Set<string>();
  const bullets: string[] = [];

  for (const sentence of sentences) {
    const cleaned = stripWhitespace(sentence);
    if (!cleaned || seen.has(cleaned.toLowerCase())) {
      continue;
    }
    seen.add(cleaned.toLowerCase());
    bullets.push(cleaned);
  }

  return bullets;
}

export class LocalExtractiveSummaryProvider implements SummaryProvider {
  summarize(input: SummaryRequest): SummaryResult {
    const mode = input.mode ?? "medium";
    const cleanedText = stripWhitespace(input.text);
    const sentences = splitIntoSentences(cleanedText);

    if (!sentences.length) {
      return {
        mode,
        summary: "",
        bullets: [],
        sentenceCount: 0
      };
    }

    if (sentences.length <= MODE_SENTENCE_COUNT[mode]) {
      return {
        mode,
        summary: sentences.join(" "),
        bullets: uniqueBullets(sentences),
        sentenceCount: sentences.length
      };
    }

    const weights = buildKeywordWeights(sentences);
    const rankedSentences: RankedSentence[] = sentences.map((sentence, index) => ({
      index,
      sentence,
      score: scoreSentence(sentence, index, sentences.length, weights)
    }));

    const selected = rankedSentences
      .sort((left, right) => right.score - left.score)
      .slice(0, MODE_SENTENCE_COUNT[mode])
      .sort((left, right) => left.index - right.index)
      .map((item) => item.sentence);

    return {
      mode,
      summary: selected.join(" "),
      bullets: uniqueBullets(selected),
      sentenceCount: selected.length
    };
  }
}

const defaultProvider = new LocalExtractiveSummaryProvider();

export function summarizeText(input: SummaryRequest): SummaryResult {
  return defaultProvider.summarize(input);
}
