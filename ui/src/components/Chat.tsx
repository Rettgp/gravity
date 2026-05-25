import { useState, useRef, useEffect } from "react";
import OutfitCard from "./OutfitCard";
import ThinkingPanel, { type ThinkingStep } from "./ThinkingPanel";
import { streamChat, type OutfitItem, type ChatMessage } from "../lib/streamChat";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  outfit_items?: OutfitItem[];
  image?: string;
  steps?: ThinkingStep[];
}

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

    const userMessage: Message = { role: "user", content: text, image: pendingImage?.dataUrl };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    const imageBase64 = pendingImage?.base64;
    const imageMediaType = pendingImage?.mediaType;
    setPendingImage(null);
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let steps: ThinkingStep[] = [];
    setThinkingSteps([]);

    const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      for await (const event of streamChat(text, history, controller.signal, imageBase64, imageMediaType)) {
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
    <div className="flex flex-col h-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-100">Chat</h2>
        <p className="text-xs text-slate-500 ml-1">Ask anything</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-slate-500 text-sm text-center m-auto">
            Ask about family docs, wardrobe, or anything else…
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
                className="max-w-[160px] rounded-xl border border-slate-700 mb-1"
              />
            )}

            {msg.role === "assistant" && msg.steps && msg.steps.length > 0 && (
              <ThinkingPanel steps={msg.steps} done={true} />
            )}

            <div
              className={`px-3 py-2 rounded-2xl max-w-[90%] text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-100"
              }`}
            >
              {msg.content}
            </div>

            {msg.sources && msg.sources.length > 0 && (
              <p className="text-xs text-slate-600 px-1">
                Sources: {msg.sources.filter(Boolean).join(", ")}
              </p>
            )}
            {msg.outfit_items && msg.outfit_items.length > 0 && (
              <OutfitCard items={msg.outfit_items} />
            )}
          </div>
        ))}

        {loading && (
          <div className="flex flex-col items-start">
            {thinkingSteps !== null && thinkingSteps.length === 0 ? (
              <div className="px-3 py-2 rounded-2xl bg-slate-800 text-slate-400 text-sm animate-pulse">
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
        <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-800">
          <img
            src={pendingImage.dataUrl}
            alt="Pending"
            className="w-10 h-10 rounded-lg object-cover border border-slate-700"
          />
          <span className="text-xs text-slate-400 flex-1 truncate">{pendingImage.file.name}</span>
          <button
            type="button"
            onClick={() => setPendingImage(null)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Remove
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-slate-800">
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
          title="Attach image"
          className="rounded-xl bg-slate-800 px-3 py-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          disabled={loading}
          className="flex-1 rounded-xl bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 min-w-0"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          Send
        </button>
      </form>
    </div>
  );
}
