"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/* --- Minimal typing for the Web Speech API (not in lib.dom for all targets) --- */
type SpeechAlt = { transcript: string };
type SpeechResult = ArrayLike<SpeechAlt> & { isFinal: boolean };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The Apollo input bar: a text field that grows with the text, a microphone
 * that dictates straight into it, and a send button. When dictation cannot
 * work, it says why and what to do — it never pretends to listen.
 */
export default function ApolloComposer({
  value,
  onChange,
  onSend,
  sending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const baseRef = useRef("");

  // Rendered on the server too, so assume supported until the browser says otherwise.
  const micSupported = useSyncExternalStore(
    () => () => {},
    () => getRecognitionCtor() !== null,
    () => true
  );

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  // Grow with the text instead of staying a one-line sliver.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [value]);

  function stopDictation() {
    try {
      recRef.current?.stop();
    } catch {
      /* not running */
    }
    setListening(false);
  }

  function toggleMic() {
    if (listening) {
      stopDictation();
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setNote(
        "Diktovanie tento prehliadač nepodporuje. Funguje v Chrome a v Edge — inde napíš správu ručne."
      );
      return;
    }
    const rec = new Ctor();
    rec.lang = "sk-SK";
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = value ? `${value.trimEnd()} ` : "";

    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += t;
        else interim += t;
      }
      if (finalText) baseRef.current = `${(baseRef.current + finalText).trimStart()} `;
      onChange((baseRef.current + interim).trimStart());
    };

    rec.onerror = (e) => {
      setListening(false);
      setNote(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Prehliadač nepustil mikrofón. Klikni na ikonu zámku vedľa adresy → Mikrofón → Povoliť, a skús znova."
          : e.error === "no-speech"
            ? "Nič som nepočul. Klikni na mikrofón znova a hovor bližšie."
            : e.error === "audio-capture"
              ? "Nenašiel som mikrofón. Skontroluj, či je pripojený a vybraný v nastaveniach systému."
              : e.error === "network"
                ? "Diktovanie potrebuje internet a spojenie vypadlo. Skús to o chvíľu."
                : `Diktovanie zlyhalo (${e.error}). Napíš to zatiaľ ručne.`
      );
    };

    rec.onend = () => setListening(false);

    recRef.current = rec;
    setNote(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setNote("Diktovanie sa nespustilo. Skús kliknúť na mikrofón ešte raz.");
    }
  }

  function handleSend() {
    if (listening) stopDictation();
    onSend();
  }

  const canSend = !sending && value.trim().length > 0;

  return (
    <div style={{ padding: 10, borderTop: "1px solid var(--line)", background: "#fff", flex: "none" }}>
      {note && (
        <div
          style={{
            fontSize: 11.5, lineHeight: 1.45, color: "#8a5b00", background: "#fff5e0",
            padding: "7px 9px", borderRadius: 9, marginBottom: 8,
          }}
        >
          {note}
        </div>
      )}

      <div
        style={{
          display: "flex", alignItems: "flex-end", gap: 6, width: "100%",
          border: `1px solid ${listening ? "var(--orange)" : "#e2e5ea"}`,
          boxShadow: listening ? "0 0 0 3px rgba(255,106,31,.14)" : "none",
          borderRadius: 14, padding: "5px 5px 5px 12px", background: "#fff",
          transition: "border-color .15s, box-shadow .15s",
        }}
      >
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder={listening ? "Počúvam…" : "Napíš Apollovi…"}
          style={{
            flex: "1 1 auto", minWidth: 0, width: "100%", resize: "none", border: "none",
            outline: "none", background: "transparent", fontSize: 13.2, lineHeight: 1.5,
            padding: "8px 0", maxHeight: 132, overflowY: "auto",
          }}
        />

        <button
          type="button"
          onClick={toggleMic}
          title={
            !micSupported
              ? "Diktovanie funguje v Chrome a Edge"
              : listening
                ? "Zastaviť diktovanie"
                : "Diktovať hlasom"
          }
          aria-label={listening ? "Zastaviť diktovanie" : "Diktovať hlasom"}
          aria-pressed={listening}
          style={{
            flex: "none", width: 36, height: 36, borderRadius: 12, display: "grid",
            placeItems: "center", border: `1px solid ${listening ? "var(--orange)" : "var(--line)"}`,
            background: listening ? "var(--orange)" : "#fff",
            color: listening ? "#fff" : micSupported ? "var(--ink-2)" : "var(--ink-3)",
            transition: ".15s",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
            <path d="M12 18v3" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          title="Poslať (Enter)"
          aria-label="Poslať"
          style={{
            flex: "none", width: 36, height: 36, borderRadius: 12, display: "grid",
            placeItems: "center", background: "var(--ink)", color: "#fff",
            opacity: canSend ? 1 : 0.4, cursor: canSend ? "pointer" : "default",
            boxShadow: canSend ? "var(--sh-dark)" : "none", transition: ".15s",
          }}
        >
          {sending ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 12h13" />
              <path d="M12.5 6.5 18.5 12l-6 5.5" />
            </svg>
          )}
        </button>
      </div>

      <div
        style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11,
          color: listening ? "var(--orange-2)" : "var(--ink-3)",
        }}
      >
        {listening ? (
          <>
            <span
              style={{
                width: 7, height: 7, borderRadius: "50%", background: "var(--orange)",
                animation: "apRecPulse 1.1s ease-in-out infinite",
              }}
            />
            Počúvam — hovor, a keď skončíš, klikni na mikrofón.
          </>
        ) : micSupported ? (
          "Enter odošle · Shift+Enter nový riadok · mikrofón diktuje"
        ) : (
          "Enter odošle · Shift+Enter nový riadok"
        )}
      </div>
    </div>
  );
}
