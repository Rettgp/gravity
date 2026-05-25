import { useState, useEffect, useRef } from "react";
import { streamOutfit, type OutfitItem } from "../lib/streamChat";

interface Props {
  personLabel: string;
  weatherSummary: string | null;
}

export default function OutfitSection({ personLabel, weatherSummary }: Props) {
  const [items, setItems] = useState<OutfitItem[]>([]);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!weatherSummary || fetched) return;
    load(weatherSummary);
  }, [weatherSummary, fetched]);

  async function load(summary: string) {
    if (loading) return;
    setFetched(true);
    setLoading(true);
    setItems([]);
    setAnswer("");

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      for await (const event of streamOutfit(personLabel, summary, ctrl.signal)) {
        if (event.type === "result") {
          setAnswer(event.answer.replace(/\[ITEMS:[\d,\s]+\]/g, "").trim());
          setItems(event.outfit_items);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function refresh() {
    if (!weatherSummary) return;
    setFetched(false);
  }

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-100">Today's Outfit</h2>
          <p className="text-xs text-slate-500 mt-0.5">Garrett · AI selected</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading || !weatherSummary}
          className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
        >
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          {loading ? "Picking…" : "New pick"}
        </button>
      </div>

      {!weatherSummary && !loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
          <span className="animate-pulse">Waiting for weather data…</span>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 flex-wrap">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-24 h-24 rounded-xl bg-slate-800 animate-pulse" />
                <div className="w-16 h-3 bg-slate-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 animate-pulse">Selecting your outfit…</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            {items.map((item) => (
              <a
                key={item.item_id}
                href={item.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 group"
              >
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 group-hover:border-violet-500 transition-colors">
                  <img
                    src={item.image_url}
                    alt={item.label}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-size='11'%3ENo img%3C/text%3E%3C/svg%3E";
                    }}
                  />
                </div>
                <span className="text-xs text-slate-400 text-center max-w-[6rem] leading-tight line-clamp-2 group-hover:text-slate-200 transition-colors">
                  {item.label}
                </span>
              </a>
            ))}
          </div>
          {answer && (
            <p className="text-sm text-slate-400 leading-relaxed border-t border-slate-800 pt-3">
              {answer}
            </p>
          )}
        </div>
      )}

      {!loading && fetched && items.length === 0 && (
        <p className="text-slate-500 text-sm py-2">
          No outfit found. Try asking in the chat below.
        </p>
      )}
    </div>
  );
}
