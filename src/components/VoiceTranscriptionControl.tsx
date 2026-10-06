import { useMemo, useRef, useState } from "react";
import { encodeWavPCM16 } from "../lib/audioWav";
import { transcribeWavBlob } from "../lib/localStt";

function resampleFloat32(input: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (inputSampleRate === outputSampleRate) return input;
  if (input.length === 0) return new Float32Array(0);

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.ceil(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const inputIndex = i * ratio;
    const index0 = Math.floor(inputIndex);
    const index1 = Math.min(index0 + 1, input.length - 1);
    const frac = inputIndex - index0;
    output[i] = input[index0] * (1 - frac) + input[index1] * frac;
  }

  return output;
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export default function VoiceTranscriptionControl(props: {
  lang?: string;
  onTranscript: (text: string) => void;
  buttonLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const lang = props.lang ?? "en";
  const buttonLabel = props.buttonLabel ?? "Record & Transcribe";
  const disabled = props.disabled ?? false;

  const [mode, setMode] = useState<"idle" | "recording" | "transcribing">("idle");
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);

  const canRecord = useMemo(
    () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    []
  );

  const cleanup = () => {
    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;

    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    streamRef.current = null;

    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  };

  const start = async () => {
    if (disabled) return;
    if (!canRecord) {
      setError("Your browser does not support microphone recording.");
      return;
    }

    setError(null);
    pcmChunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const AudioCtx =
      window.AudioContext ||
      ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext as
        | typeof AudioContext);
    const audioContext = new AudioCtx({ latencyHint: "interactive" });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    const gain = audioContext.createGain();
    gain.gain.value = 0; // Prevent feedback/monitoring.

    processor.onaudioprocess = (ev) => {
      // Copy because the underlying buffer is reused.
      const input = ev.inputBuffer.getChannelData(0);
      pcmChunksRef.current.push(new Float32Array(input));
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioContext.destination);

    setMode("recording");
  };

  const stopAndTranscribe = async () => {
    if (mode !== "recording") return;
    setMode("transcribing");
    setError(null);

    const chunks = pcmChunksRef.current;
    const inputSampleRate = audioContextRef.current?.sampleRate ?? 44100;
    cleanup();

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const targetSampleRate = 16000;
    const resampled = resampleFloat32(merged, inputSampleRate, targetSampleRate);
    const pcm16 = floatToInt16(resampled);
    const wavBuffer = encodeWavPCM16(pcm16, targetSampleRate);
    const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });

    try {
      const { text } = await transcribeWavBlob(wavBlob, { lang });
      props.onTranscript(text.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setMode("idle");
    }
  };

  return (
    <div className={props.className}>
      <button
        type="button"
        disabled={disabled || mode === "transcribing" || !canRecord}
        onClick={() => {
          if (mode === "recording") void stopAndTranscribe();
          else void start();
        }}
        style={{
          padding: "0.4rem 0.75rem",
          fontSize: "0.875rem",
          borderRadius: "0.5rem",
          border: mode === "recording" ? "1px solid #dc2626" : "1px solid #d1d5db",
          backgroundColor: mode === "recording" ? "transparent" : "var(--surface-panel)",
          color: mode === "recording" ? "#dc2626" : "var(--text-primary)",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "Montserrat, sans-serif",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {mode === "recording" ? "Stop" : mode === "transcribing" ? "Transcribing..." : buttonLabel}
      </button>

      {mode === "recording" && (
        <div
          style={{
            marginTop: "0.25rem",
            color: "#dc2626",
            fontSize: "0.75rem",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          Recording...
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: "0.25rem",
            color: "#dc2626",
            fontSize: "0.75rem",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

