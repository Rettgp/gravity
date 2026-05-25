import { useState, useRef, useEffect } from "react";
import OutfitCard from "./OutfitCard";
import ThinkingPanel, { type ThinkingStep } from "./ThinkingPanel";

interface OutfitItem {
  item_id: number;
  label: string;
  image_url: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  outfit_items?: OutfitItem[];
  image?: string; // base64 data URL for display
  steps?: ThinkingStep[]; // reasoning steps captured during generation
}

// --- SSE event types ---

type SseStep = {
  type: "step";
  step_type: "thought" | "action" | "observation";
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
};

type SseResult = {
  type: "result";
  answer: string;
  sources: string[];
  outfit_items: OutfitItem[];
};

type SseError = { type: "error"; message: string };
type SseEvent = SseStep | SseResult | SseError;

// --- Streaming fetch helper ---

async function* streamChat(
  message: string,
  history: Message[],
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
      history: history.map((m) => ({ role: m.role, content: m.content })),
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

// --- File → base64 ---

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [meta, data] = dataUrl.split(",");
      const mediaType = meta.split(":")[1].split(";")[0];
      resolve({ base64: data, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- Component ---

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[] | null>(null);
  const [pendingImage, setPendingImage] = useState<{
    file: File;
    dataUrl: string;
    base64: string;
    mediaType: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingSteps]);

  // Abort any in-flight request when the component unmounts
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { base64, mediaType } = await fileToBase64(file);
    const dataUrl = `data:${mediaType};base64,${base64}`;
    setPendingImage({ file, dataUrl, base64, mediaType });
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = {
      role: "user",
      content: text,
      image: pendingImage?.dataUrl,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    const imageBase64 = pendingImage?.base64;
    const imageMediaType = pendingImage?.mediaType;
    setPendingImage(null);
    setLoading(true);

    // Abort any previous request and create a fresh controller
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let steps: ThinkingStep[] = [];
    setThinkingSteps([]);

    try {
      for await (const event of streamChat(
        text,
        messages,
        controller.signal,
        imageBase64,
        imageMediaType,
      )) {
        if (event.type === "step") {
          steps = [...steps, event];
          setThinkingSteps(steps);
        } else if (event.type === "result") {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: event.answer,
              sources: event.sources,
              outfit_items: event.outfit_items,
              steps: steps.length > 0 ? steps : undefined,
            },
          ]);
          setThinkingSteps(null);
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
      setThinkingSteps(null);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      <div className="flex flex-col gap-3 min-h-[400px] max-h-[60vh] overflow-y-auto rounded-xl bg-gray-900 p-4">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-auto">
            Ask anything about your family docs or wardrobe...
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {msg.image && (
              <img
                src={msg.image}
                alt="Attached"
                className="max-w-[200px] rounded-xl border border-gray-700 mb-1"
              />
            )}

            {/* Thinking panel sits above the answer bubble for assistant messages */}
            {msg.role === "assistant" && msg.steps && msg.steps.length > 0 && (
              <ThinkingPanel steps={msg.steps} done={true} />
            )}

            <div
              className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-100"
              }`}
            >
              {msg.content}
            </div>

            {msg.sources && msg.sources.length > 0 && (
              <div className="text-xs text-gray-500 px-1">
                Sources: {msg.sources.filter(Boolean).join(", ")}
              </div>
            )}
            {msg.outfit_items && msg.outfit_items.length > 0 && (
              <OutfitCard items={msg.outfit_items} />
            )}
          </div>
        ))}

        {/* Live thinking panel while streaming */}
        {loading && (
          <div className="flex flex-col items-start">
            {thinkingSteps !== null && thinkingSteps.length === 0 ? (
              /* Supervisor is still routing — no wardrobe steps yet */
              <div className="px-4 py-2 rounded-2xl bg-gray-800 text-gray-400 text-sm animate-pulse">
                Thinking…
              </div>
            ) : thinkingSteps !== null && thinkingSteps.length > 0 ? (
              <ThinkingPanel steps={thinkingSteps} done={false} />
            ) : null}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {pendingImage && (
        <div className="flex items-center gap-2 px-1">
          <img
            src={pendingImage.dataUrl}
            alt="Pending"
            className="w-12 h-12 rounded-lg object-cover border border-gray-700"
          />
          <span className="text-xs text-gray-400 flex-1 truncate">{pendingImage.file.name}</span>
          <button
            type="button"
            onClick={() => setPendingImage(null)}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Remove
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          title="Attach an image"
          className="rounded-xl bg-gray-800 px-3 py-3 text-gray-400 hover:text-gray-200 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={loading}
          className="flex-1 rounded-xl bg-gray-800 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
