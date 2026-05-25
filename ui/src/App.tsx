import { useState, useEffect } from "react";
import WeatherWidget from "./components/WeatherWidget";
import OutfitSection from "./components/OutfitSection";
import Chat from "./components/Chat";

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

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm sticky top-0 z-10">
        <img src="/logo_simple.png" alt="Gravity" className="h-10 object-contain" />
        <Clock />
      </header>

      <main className="flex-1 p-6 flex flex-col gap-5 overflow-hidden min-h-0">
        <WeatherWidget onLoaded={setWeatherSummary} />

        <div className="flex gap-5 flex-1 min-h-0">
          <div className="flex-1 min-w-0 overflow-y-auto">
            <OutfitSection weatherSummary={weatherSummary} />
          </div>

          <div className="w-[380px] flex-shrink-0 flex flex-col">
            <Chat />
          </div>
        </div>
      </main>
    </div>
  );
}
