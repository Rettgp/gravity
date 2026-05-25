import { useState, useEffect } from "react";
import WeatherWidget from "./components/WeatherWidget";
import OutfitSection from "./components/OutfitSection";
import Chat from "./components/Chat";
import CatalogEditor from "./components/CatalogEditor";

function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="text-right leading-tight">
      <p className="text-lg font-semibold text-slate-100">{time}</p>
      <p className="text-xs text-slate-400 mt-0.5">{date}</p>
    </div>
  );
}

export default function App() {
  const [weatherSummary, setWeatherSummary] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {showEditor && <CatalogEditor onClose={() => setShowEditor(false)} />}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img src="/logo_simple.png" alt="Gravity" className="h-10 object-contain" />
          <button
            onClick={() => setShowEditor(true)}
            className="text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors text-xs px-2.5 py-1 rounded-md border border-slate-700"
            title="Edit wardrobe catalog"
          >
            Edit Wardrobe Catalog
          </button>
        </div>
        <Clock />
      </header>

      <main className="flex-1 p-4 lg:p-6 flex flex-col gap-4 lg:gap-5 overflow-y-auto lg:overflow-hidden min-h-0">
        <WeatherWidget onLoaded={setWeatherSummary} />

        <div className="flex flex-col lg:flex-row lg:flex-1 lg:min-h-0 gap-4 lg:gap-5">
          <div className="lg:flex-1 min-w-0 lg:overflow-y-auto">
            <OutfitSection personLabel="garrett" weatherSummary={weatherSummary} />
          </div>

          <div className="w-full lg:w-[380px] flex-shrink-0 flex flex-col h-[420px] lg:h-auto">
            <Chat />
          </div>
        </div>
      </main>
    </div>
  );
}
