import { useEffect } from "react";
import { sendChat, sendVoice, type ChatResult } from "@/lib/udyam-backend.functions";

function sessionId() {
  const k = "udyam-chat-session";
  let id = localStorage.getItem(k);
  if (!id) {
    id = `cust-${crypto.randomUUID()}`;
    localStorage.setItem(k, id);
  }
  return id;
}

/** Wires the assistant screen's message box, send and mic buttons to the backend. */
export function useAssistantChat() {
  useEffect(() => {
    const log = document.getElementById("chat-log");
    const input = document.getElementById("chat-input") as HTMLInputElement | null;
    const send = document.getElementById("chat-send");
    const mic = document.getElementById("mic-trigger");
    if (!log || !input || !send || !mic) return;
    const sid = sessionId();
    let busy = false;

    const bubble = (text: string, who: "user" | "bot" | "error") => {
      const el = document.createElement("div");
      el.textContent = text;
      el.className =
        who === "user"
          ? "self-end max-w-[85%] rounded-xl rounded-br-sm bg-airtelRed text-white px-3 py-2 text-sm"
          : who === "error"
            ? "self-start max-w-[85%] rounded-xl bg-error-container text-on-error-container px-3 py-2 text-sm"
            : "self-start max-w-[85%] rounded-xl rounded-bl-sm bg-surface-container-lowest text-on-surface shadow-sm px-3 py-2 text-sm";
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    };
    const show = (r: ChatResult, pending: HTMLElement) => {
      pending.remove();
      if (r.ok) bubble(r.reply || "(no reply)", "bot");
      else bubble(r.error, "error");
    };

    const submit = async () => {
      const message = input.value.trim();
      if (!message || busy) return;
      busy = true;
      input.value = "";
      bubble(message, "user");
      const pending = bubble("Soumya is typing…", "bot");
      try {
        show(await sendChat({ data: { message, sessionId: sid } }), pending);
      } catch {
        show({ ok: false, error: "Message couldn't be sent." }, pending);
      } finally {
        busy = false;
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && submit();

    let recorder: MediaRecorder | null = null;
    const onMic = async () => {
      if (recorder?.state === "recording") {
        recorder.stop();
        return;
      }
      if (busy) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks: Blob[] = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          mic.classList.remove("animate-pulse", "bg-airtelRed", "text-white");
          const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
          if (!blob.size) return;
          busy = true;
          bubble("🎤 Voice message", "user");
          const pending = bubble("Soumya is listening…", "bot");
          try {
            const buf = new Uint8Array(await blob.arrayBuffer());
            let bin = "";
            for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            show(await sendVoice({ data: { audioBase64: btoa(bin), mimeType: blob.type, sessionId: sid } }), pending);
          } catch {
            show({ ok: false, error: "Voice message couldn't be sent." }, pending);
          } finally {
            busy = false;
          }
        };
        recorder.start();
        mic.classList.add("animate-pulse", "bg-airtelRed", "text-white");
      } catch {
        bubble("Microphone access was blocked. Allow it in your browser to speak.", "error");
      }
    };

    send.addEventListener("click", submit);
    input.addEventListener("keydown", onKey);
    mic.addEventListener("click", onMic);
    return () => {
      send.removeEventListener("click", submit);
      input.removeEventListener("keydown", onKey);
      mic.removeEventListener("click", onMic);
      if (recorder?.state === "recording") recorder.stop();
    };
  }, []);
}
