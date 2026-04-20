import type { TtsVoiceOption } from "@doc2speech/shared";

export type PlaybackState = "idle" | "playing" | "paused";

export type SpeechPlaybackConfig = {
  text: string;
  language: string;
  voiceId?: string;
  rate?: number;
  pitch?: number;
};

export interface TtsProvider {
  readonly providerId: string;
  listVoices(): Promise<TtsVoiceOption[]>;
  play(config: SpeechPlaybackConfig): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  getState(): PlaybackState;
}

type VoiceLike = {
  id: string;
  languages?: string[];
  lang?: string;
};

export function pickLanguageVoice<T extends VoiceLike>(voices: T[], language: string, preferredVoiceId?: string): T | undefined {
  if (preferredVoiceId) {
    const exact = voices.find((voice) => voice.id === preferredVoiceId);
    if (exact) {
      return exact;
    }
  }

  return (
    voices.find((voice) => {
      if (voice.languages) {
        return voice.languages.some((item) => item.toLowerCase() === language.toLowerCase());
      }

      if (voice.lang) {
        return voice.lang.toLowerCase().startsWith(language.toLowerCase());
      }

      return false;
    }) ?? voices[0]
  );
}
