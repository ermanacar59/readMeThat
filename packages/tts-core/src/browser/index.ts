import { TtsVoiceOption } from "@doc2speech/shared";
import { PlaybackState, SpeechPlaybackConfig, TtsProvider, pickLanguageVoice } from "../index";

export class BrowserSpeechSynthesisProvider implements TtsProvider {
  readonly providerId = "browser-native";
  private state: PlaybackState = "idle";

  private get synth(): SpeechSynthesis {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      throw new Error("Speech synthesis is not available in this browser.");
    }
    return window.speechSynthesis;
  }

  async listVoices(): Promise<TtsVoiceOption[]> {
    const voices = this.synth.getVoices();
    return voices.map((voice) => ({
      id: voice.voiceURI,
      name: voice.name,
      provider: "browser-native",
      languages: [voice.lang.split("-")[0].toLowerCase()]
    }));
  }

  async play(config: SpeechPlaybackConfig): Promise<void> {
    this.stop();
    const utterance = new SpeechSynthesisUtterance(config.text);
    const voices = await this.listVoices();
    const selectedVoice = pickLanguageVoice(voices, config.language, config.voiceId);

    if (selectedVoice) {
      const rawVoice = this.synth.getVoices().find((voice) => voice.voiceURI === selectedVoice.id);
      if (rawVoice) utterance.voice = rawVoice;
      utterance.lang = config.language;
    } else {
      utterance.lang = config.language;
    }

    utterance.rate = config.rate ?? 1;
    utterance.pitch = config.pitch ?? 1;
    utterance.onstart = () => {
      this.state = "playing";
    };
    utterance.onend = () => {
      this.state = "idle";
    };
    utterance.onerror = () => {
      this.state = "idle";
    };

    this.synth.speak(utterance);
  }

  pause(): void {
    this.synth.pause();
    this.state = "paused";
  }

  resume(): void {
    this.synth.resume();
    this.state = "playing";
  }

  stop(): void {
    this.synth.cancel();
    this.state = "idle";
  }

  getState(): PlaybackState {
    return this.state;
  }
}
