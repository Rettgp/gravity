import { useState, useRef, useEffect } from "react";
import OutfitCard from "./OutfitCard";

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
}

async function sendMessage(
  message: string,
  history: Message[],
  imageBase64?: string,
  imageMediaType?: string,
): Promise<{ answer: string; sources: string[]; outfit_items: OutfitItem[] }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      image_base64: imageBase64 ?? null,
      image_media_type: imageMediaType ?? null,
    }),
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // dataUrl is "data:<mediaType>;base64,<data>"
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
  const [pendingImage, setPendingImage] = useState<{
    file: File;
    dataUrl: string;
    base64: string;
    mediaType: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    try {
      const { answer, sources, outfit_items } = await sendMessage(
        text,
        messages,
        imageBase64,
        imageMediaType,
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer, sources, outfit_items },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
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
        {loading && (
          <div className="flex items-start">
            <div className="px-4 py-2 rounded-2xl bg-gray-800 text-gray-400 text-sm animate-pulse">
              Thinking...
            </div>
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
