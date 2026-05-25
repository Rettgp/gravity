export interface OutfitItem {
  item_id: number;
  label: string;
  image_url: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type SseStep = {
  type: "step";
  step_type: "thought" | "action" | "observation";
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
};

export type SseResult = {
  type: "result";
  answer: string;
  sources: string[];
  outfit_items: OutfitItem[];
};

export type SseError = { type: "error"; message: string };
export type SseEvent = SseStep | SseResult | SseError;

export async function* streamOutfit(
  personLabel: string,
  weatherSummary: string,
  signal: AbortSignal,
): AsyncGenerator<SseEvent> {
  const res = await fetch("/api/wardrobe/outfit/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ person_label: personLabel, weather_summary: weatherSummary }),
  });

  if (!res.ok) throw new Error(`Server error: ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.startsWith("data: ") && line.length > 6) {
          yield JSON.parse(line.slice(6)) as SseEvent;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamChat(
  message: string,
  history: ChatMessage[],
  signal: AbortSignal,
  imageBase64?: string,
  imageMediaType?: string,
): AsyncGenerator<SseEvent> {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      message,
      history,
      image_base64: imageBase64 ?? null,
      image_media_type: imageMediaType ?? null,
    }),
  });

  if (!res.ok) throw new Error(`Server error: ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.startsWith("data: ") && line.length > 6) {
          yield JSON.parse(line.slice(6)) as SseEvent;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
