import { useEffect, useMemo, useState } from "react";
import { TtsVoiceOption } from "@doc2speech/shared";
import { BrowserSpeechSynthesisProvider } from "@doc2speech/tts-core/browser";

const provider = new BrowserSpeechSynthesisProvider();

export function useBrowserVoices() {
  const [voices, setVoices] = useState<TtsVoiceOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const loaded = await provider.listVoices();
        if (active) setVoices(loaded);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    const synth = window.speechSynthesis;
    synth.onvoiceschanged = () => {
      load();
    };

    return () => {
      active = false;
      synth.onvoiceschanged = null;
    };
  }, []);

  const groupedByLanguage = useMemo(() => {
    return voices.reduce<Record<string, TtsVoiceOption[]>>((acc, voice) => {
      for (const language of voice.languages) {
        const normalized = language.toLowerCase();
        acc[normalized] = acc[normalized] ?? [];
        acc[normalized].push(voice);
      }
      return acc;
    }, {});
  }, [voices]);

  return { provider, voices, groupedByLanguage, loading };
}
