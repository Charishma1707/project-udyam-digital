import { createServerFn } from "@tanstack/react-start";

// The Python (FastAPI) backend from backend.md. Override with the UDYAM_BACKEND_URL env var.
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

export type ChatResult =
  | { ok: true; reply: string; completion: number; ready: boolean; missing: string[] }
  | { ok: false; error: string };

function backendUrl() {
  return (process.env["UDYAM_BACKEND_URL"] || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

async function toResult(res: Response): Promise<ChatResult> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`Backend ${res.status}: ${text.slice(0, 500)}`);
    return {
      ok: false,
      error:
        res.status === 503 || res.status === 502 || res.status === 504
          ? "The assistant's server is offline right now. Please try again once it's running."
          : `The assistant couldn't answer (error ${res.status}).`,
    };
  }
  try {
    const j = JSON.parse(text);
    return {
      ok: true,
      reply: String(j.reply ?? ""),
      completion: Number(j.completion_percentage ?? 0),
      ready: Boolean(j.ready_for_recommendation),
      missing: Array.isArray(j.missing_fields) ? j.missing_fields : [],
    };
  } catch {
    return { ok: false, error: "The assistant's server sent an unexpected reply." };
  }
}

const headers = { "bypass-tunnel-reminder": "1" };

export const sendChat = createServerFn({ method: "POST" })
  .inputValidator((d: { message: string; sessionId: string }) => {
    const message = String(d.message ?? "").trim().slice(0, 2000);
    const sessionId = String(d.sessionId ?? "").slice(0, 100);
    if (!message || !sessionId) throw new Error("Message required");
    return { message, sessionId };
  })
  .handler(async ({ data }): Promise<ChatResult> => {
    try {
      const res = await fetch(`${backendUrl()}/api/chat`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: data.message, session_id: data.sessionId }),
      });
      return toResult(res);
    } catch (e) {
      console.error(e);
      return { ok: false, error: "The assistant's server can't be reached right now." };
    }
  });

export const sendVoice = createServerFn({ method: "POST" })
  .inputValidator((d: { audioBase64: string; mimeType: string; sessionId: string }) => {
    if (!d.audioBase64 || d.audioBase64.length > 14_000_000) throw new Error("Recording missing or too long");
    return { audioBase64: d.audioBase64, mimeType: String(d.mimeType || "audio/webm"), sessionId: String(d.sessionId).slice(0, 100) };
  })
  .handler(async ({ data }): Promise<ChatResult> => {
    try {
      const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
      const form = new FormData();
      const ext = data.mimeType.includes("wav") ? "wav" : data.mimeType.includes("mp") ? "mp3" : "webm";
      form.append("audio", new Blob([bytes], { type: data.mimeType }), `voice.${ext}`);
      form.append("session_id", data.sessionId);
      const res = await fetch(`${backendUrl()}/api/voice`, { method: "POST", headers, body: form });
      return toResult(res);
    } catch (e) {
      console.error(e);
      return { ok: false, error: "The assistant's server can't be reached right now." };
    }
  });
