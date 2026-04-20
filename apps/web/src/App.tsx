import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ParsedDocument,
  SpeechTonePreset,
  SUPPORTED_LANGUAGES,
  TtsVoiceOption,
  getLanguageLabel
} from "@doc2speech/shared";
import { StatusBanner } from "./components/StatusBanner";
import {
  SummaryMode,
  detectDocumentLanguage,
  fetchSpeechStatus,
  fetchVoiceMetadata,
  getPlaybackConfig,
  parseFile,
  parseText,
  splitTextForSpeech,
  summarizeDocument,
  synthesizeSpeech
} from "./lib/api";

type LanguageMode = "auto" | "manual";
type StatusTone = "neutral" | "success" | "error";
type StatusState = { message: string; tone: StatusTone };
type SummaryState = { summary: string; bullets: string[]; sentenceCount: number; mode: SummaryMode };
type SpeechStatusState = {
  provider: "openai" | "disabled";
  configured: boolean;
  reachable: boolean;
  model?: string;
  message: string;
};

export function App() {
  const [rawText, setRawText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedDocument, setParsedDocument] = useState<ParsedDocument | null>(null);
  const [languageMode, setLanguageMode] = useState<LanguageMode>("auto");
  const [detectedLanguage, setDetectedLanguage] = useState("en");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [tonePreset, setTonePreset] = useState<SpeechTonePreset>("narrator");
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("medium");
  const [summary, setSummary] = useState<SummaryState | null>(null);
  const [voiceOptions, setVoiceOptions] = useState<TtsVoiceOption[]>([]);
  const [providerMode, setProviderMode] = useState<"openai" | "browser-native" | "disabled">("disabled");
  const [speechStatus, setSpeechStatus] = useState<SpeechStatusState | null>(null);
  const [status, setStatus] = useState<StatusState>({ message: "Ready.", tone: "neutral" });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const currentAudioIndexRef = useRef(0);

  function clearAudioQueue() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }

    for (const url of audioQueueRef.current) {
      URL.revokeObjectURL(url);
    }

    audioQueueRef.current = [];
    currentAudioIndexRef.current = 0;
  }

  async function playAudioQueue(urls: string[]) {
    clearAudioQueue();
    audioQueueRef.current = urls;
    currentAudioIndexRef.current = 0;

    const startAt = async (index: number) => {
      const url = audioQueueRef.current[index];
      if (!url) {
        setIsPlaying(false);
        setIsPaused(false);
        setStatus({ message: "Playback finished.", tone: "success" });
        return;
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      currentAudioIndexRef.current = index;
      audio.onended = () => {
        void startAt(index + 1);
      };
      await audio.play();
    };

    await startAt(0);
  }

  useEffect(() => {
    let active = true;

    const loadSpeechMetadata = async () => {
      try {
        const [voicesMetadata, ttsStatus] = await Promise.all([fetchVoiceMetadata(), fetchSpeechStatus()]);
        if (!active) {
          return;
        }

        setVoiceOptions(voicesMetadata.voices);
        setProviderMode(voicesMetadata.providerMode);
        setSpeechStatus(ttsStatus);
      } catch (error) {
        if (!active) {
          return;
        }

        setSpeechStatus({
          provider: "disabled",
          configured: false,
          reachable: false,
          message: error instanceof Error ? error.message : "Could not load speech provider status."
        });
      }
    };

    loadSpeechMetadata();

    return () => {
      active = false;
      clearAudioQueue();
    };
  }, []);

  const visibleVoices = useMemo(() => {
    const targetLanguage = languageMode === "manual" ? selectedLanguage : detectedLanguage;
    return voiceOptions.filter((voice) => voice.languages.some((language) => language.toLowerCase() === targetLanguage.toLowerCase()));
  }, [voiceOptions, languageMode, selectedLanguage, detectedLanguage]);

  async function extractCurrentInput(showSuccessStatus = true): Promise<ParsedDocument | null> {
    if (!rawText.trim() && !selectedFile) {
      setStatus({ message: "Paste text or upload a document first.", tone: "error" });
      return null;
    }

    setIsExtracting(true);
    setStatus({ message: "Extracting readable text...", tone: "neutral" });
    try {
      const document = selectedFile
        ? await parseFile(selectedFile)
        : await parseText(rawText, rawText ? "Pasted Text" : undefined);

      setParsedDocument(document);
      setSummary(null);
      const detection = await detectDocumentLanguage(document.normalizedText);
      setDetectedLanguage(detection.detectedLanguage);
      if (languageMode === "manual" && !selectedLanguage) {
        setSelectedLanguage(detection.detectedLanguage);
      }

      if (showSuccessStatus) {
        setStatus({
          message: `Text extracted. Detected ${detection.detectedLabel} with ${detection.confidence} confidence.`,
          tone: "success"
        });
      }
      return document;
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : "Extraction failed.",
        tone: "error"
      });
      return null;
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleExtract() {
    await extractCurrentInput(true);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setParsedDocument(null);
    setSummary(null);
  }

  async function ensureDocumentReady(): Promise<ParsedDocument | null> {
    if (parsedDocument?.normalizedText) {
      return parsedDocument;
    }

    return extractCurrentInput(false);
  }

  async function playText(text: string, forcedVoiceId?: string) {
    if (!text.trim()) {
      setStatus({ message: "There is no text ready for playback yet.", tone: "error" });
      return;
    }

    try {
      setIsPreparingAudio(true);
      const chunks = splitTextForSpeech(text);
      setChunkCount(chunks.length);
      const playbackConfig = await getPlaybackConfig({
        textLength: text.length,
        languageMode,
        detectedLanguage,
        selectedLanguage,
        voiceId: forcedVoiceId || selectedVoiceId || undefined,
        tonePreset
      });

      const synthesis = await synthesizeSpeech({
        text,
        textLength: text.length,
        languageMode,
        detectedLanguage,
        selectedLanguage,
        voiceId: playbackConfig.voiceId,
        tonePreset
      });
      const urls = (synthesis.audioChunks || (synthesis.audioBlob ? [synthesis.audioBlob] : []))
        .map((blob) => URL.createObjectURL(blob));
      await playAudioQueue(urls);

      setIsPlaying(true);
      setIsPaused(false);
      setStatus({
        message: `${playbackConfig.message} Using ${synthesis.voiceId || "auto"} on ${synthesis.model || "OpenAI TTS"} in ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}.`,
        tone: "success"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : "Playback failed.",
        tone: "error"
      });
    } finally {
      setIsPreparingAudio(false);
    }
  }

  async function handlePlay() {
    const documentToPlay = await ensureDocumentReady();
    if (!documentToPlay?.normalizedText) {
      return;
    }
    await playText(documentToPlay.normalizedText);
  }

  async function handleGenerateSummary() {
    const documentToSummarize = await ensureDocumentReady();
    if (!documentToSummarize?.normalizedText) {
      return;
    }

    setIsSummarizing(true);
    setStatus({ message: "Generating summary...", tone: "neutral" });

    try {
      const result = await summarizeDocument(
        documentToSummarize.normalizedText,
        summaryMode,
        languageMode === "manual" ? selectedLanguage : detectedLanguage
      );
      setSummary(result);
      setStatus({
        message: `Summary ready with ${result.sentenceCount} key sentence${result.sentenceCount === 1 ? "" : "s"}.`,
        tone: "success"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : "Summary generation failed.",
        tone: "error"
      });
    } finally {
      setIsSummarizing(false);
    }
  }

  async function handlePlaySummary() {
    if (!summary?.summary) {
      setStatus({ message: "Generate a summary first.", tone: "error" });
      return;
    }
    await playText(summary.summary);
  }

  async function handleVoiceComparison(voiceId: string) {
    await playText(
      "Merhaba, bu ses karsilastirmasi ReadMeThat icin yapilan kisa bir Turkce denemedir.",
      voiceId
    );
  }

  function handlePause() {
    audioRef.current?.pause();
    setIsPaused(true);
    setIsPlaying(false);
    setStatus({ message: "Playback paused.", tone: "neutral" });
  }

  function handleResume() {
    void audioRef.current?.play();
    setIsPaused(false);
    setIsPlaying(true);
    setStatus({ message: "Playback resumed.", tone: "success" });
  }

  function handleStop() {
    clearAudioQueue();
    setIsPaused(false);
    setIsPlaying(false);
    setStatus({ message: "Playback stopped.", tone: "neutral" });
  }

  const effectiveLanguage = languageMode === "manual" ? selectedLanguage : detectedLanguage;

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">ReadMeThat</p>
          <h1>Turn documents into listening-ready speech.</h1>
          <p className="subtle">
            ReadMeThat lets you paste text or upload a TXT, PDF, or DOCX file, review the extracted text, and play it back with auto language detection, manual override, and AI voice selection.
          </p>
          <div className="hero-links">
            <span className="hero-domain">readmethat.com</span>
            <span className="hero-note">Local-first MVP running on your machine</span>
          </div>
        </div>
        <div className="badge-cluster">
          <span className="soft-badge">Web UI</span>
          <span className="soft-badge">Fastify API</span>
          <span className="soft-badge">OpenAI TTS AI</span>
        </div>
      </section>

      <section className="brand-grid">
        <div className="brand-card">
          <span className="label">Use Cases</span>
          <strong>Listen to long docs instead of staring at them.</strong>
        </div>
        <div className="brand-card">
          <span className="label">Input Modes</span>
          <strong>Paste text or upload TXT, PDF, and DOCX.</strong>
        </div>
        <div className="brand-card">
          <span className="label">Future Shape</span>
          <strong>Ready to expand into web, iPhone, and Android.</strong>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel">
          <h2>Text Input</h2>
          <textarea
            value={rawText}
            onChange={(event) => {
              setRawText(event.target.value);
              setSummary(null);
              if (!selectedFile) {
                setParsedDocument(null);
              }
            }}
            placeholder="Paste or draft text here..."
            rows={10}
          />
        </div>

        <div className="panel">
          <h2>Document Upload</h2>
          <input type="file" accept=".txt,.pdf,.docx" onChange={handleFileChange} />
          <p className="subtle">{selectedFile ? `Selected: ${selectedFile.name}` : "Supported: TXT, PDF, DOCX"}</p>
          <button className="primary" onClick={handleExtract} disabled={isExtracting || (!rawText.trim() && !selectedFile)}>
            {isExtracting ? "Extracting..." : "Extract Text"}
          </button>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel">
          <h2>Language</h2>
          <label className="field">
            <span>Mode</span>
            <select value={languageMode} onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}>
              <option value="auto">Auto Detect</option>
              <option value="manual">Manual Override</option>
            </select>
          </label>
          {languageMode === "manual" ? (
            <label className="field">
              <span>Manual Language</span>
              <select value={selectedLanguage} onChange={(event) => setSelectedLanguage(event.target.value)}>
                {SUPPORTED_LANGUAGES.filter((item) => item.code !== "auto").map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="info-card">
              <span className="label">Detected</span>
              <strong>{getLanguageLabel(detectedLanguage)}</strong>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Voice</h2>
          <label className="field">
            <span>Available Voices</span>
            <select value={selectedVoiceId} onChange={(event) => setSelectedVoiceId(event.target.value)}>
              <option value="">Auto-select best voice</option>
              {visibleVoices.map((voice: TtsVoiceOption) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}{voice.recommended ? " (Recommended)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tone Preset</span>
            <select value={tonePreset} onChange={(event) => setTonePreset(event.target.value as SpeechTonePreset)}>
              <option value="warm">Warm</option>
              <option value="neutral">Neutral</option>
              <option value="narrator">Narrator</option>
            </select>
          </label>
          <p className="subtle">{`${visibleVoices.length} OpenAI voices available for ${getLanguageLabel(effectiveLanguage)}.`}</p>
          <div className="info-card">
            <span className="label">Speech Provider</span>
            <strong>{speechStatus?.message ?? "Checking provider..."}</strong>
          </div>
          <p className="subtle">Provider mode: {providerMode}</p>
          {effectiveLanguage === "tr" ? (
            <div className="control-row">
              <button onClick={() => void handleVoiceComparison("marin")} disabled={isPreparingAudio}>
                Test Marin
              </button>
              <button onClick={() => void handleVoiceComparison("cedar")} disabled={isPreparingAudio}>
                Test Cedar
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Playback</h2>
        <div className="control-row">
          <button
            className="primary"
            onClick={handlePlay}
            disabled={isExtracting || isSummarizing || isPreparingAudio || (!parsedDocument && !rawText.trim() && !selectedFile)}
          >
            {isPreparingAudio ? "Preparing Audio..." : "Play Full Text"}
          </button>
          <button onClick={handlePlaySummary} disabled={isExtracting || isSummarizing || isPreparingAudio || !summary?.summary}>
            Play Summary
          </button>
          <button onClick={handlePause} disabled={!isPlaying}>
            Pause
          </button>
          <button onClick={handleResume} disabled={!isPaused}>
            Resume
          </button>
          <button onClick={handleStop}>
            Stop
          </button>
        </div>
        <p className="subtle">
          {chunkCount > 1
            ? `This playback is split into ${chunkCount} chunks to avoid the single-request TTS limit.`
            : "Short passages play in a single synthesis request."}
        </p>
      </section>

      <section className="panel">
        <h2>Summary</h2>
        <div className="control-row">
          <label className="field inline-field">
            <span>Summary Mode</span>
            <select value={summaryMode} onChange={(event) => setSummaryMode(event.target.value as SummaryMode)}>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
          <button
            className="primary"
            onClick={handleGenerateSummary}
            disabled={isExtracting || isSummarizing || (!parsedDocument && !rawText.trim() && !selectedFile)}
          >
            {isSummarizing ? "Generating..." : "Generate Summary"}
          </button>
        </div>
        {summary ? (
          <>
            <p className="subtle">
              {summary.mode} summary, {summary.sentenceCount} key sentence{summary.sentenceCount === 1 ? "" : "s"} selected.
            </p>
            <pre className="preview-text">{summary.summary}</pre>
            <ul className="summary-list">
              {summary.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="subtle">No summary yet. Extract text first or press Generate Summary directly.</p>
        )}
      </section>

      <section className="panel">
        <h2>Status</h2>
        <StatusBanner message={status.message} tone={status.tone} />
      </section>

      <section className="panel">
        <h2>Extracted Text Preview</h2>
        {parsedDocument ? (
          <>
            <div className="preview-meta">
              <span>{parsedDocument.sourceName}</span>
              <span>{parsedDocument.wordCount} words</span>
              <span>{parsedDocument.characterCount} chars</span>
            </div>
            <pre className="preview-text">{parsedDocument.normalizedText}</pre>
          </>
        ) : (
          <p className="subtle">No extracted text yet.</p>
        )}
      </section>
    </main>
  );
}
