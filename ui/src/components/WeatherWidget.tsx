import { useState, useEffect } from "react";

const WMO: Record<number, { label: string; emoji: string }> = {
  0: { label: "Clear Sky", emoji: "☀️" },
  1: { label: "Mainly Clear", emoji: "🌤️" },
  2: { label: "Partly Cloudy", emoji: "⛅" },
  3: { label: "Overcast", emoji: "☁️" },
  45: { label: "Foggy", emoji: "🌫️" },
  48: { label: "Icy Fog", emoji: "🌫️" },
  51: { label: "Light Drizzle", emoji: "🌦️" },
  53: { label: "Drizzle", emoji: "🌦️" },
  55: { label: "Heavy Drizzle", emoji: "🌧️" },
  61: { label: "Light Rain", emoji: "🌧️" },
  63: { label: "Rain", emoji: "🌧️" },
  65: { label: "Heavy Rain", emoji: "🌧️" },
  71: { label: "Light Snow", emoji: "❄️" },
  73: { label: "Snow", emoji: "❄️" },
  75: { label: "Heavy Snow", emoji: "❄️" },
  77: { label: "Snow Grains", emoji: "🌨️" },
  80: { label: "Showers", emoji: "🌦️" },
  81: { label: "Showers", emoji: "🌧️" },
  82: { label: "Heavy Showers", emoji: "🌧️" },
  85: { label: "Snow Showers", emoji: "🌨️" },
  86: { label: "Heavy Snow Showers", emoji: "🌨️" },
  95: { label: "Thunderstorm", emoji: "⛈️" },
  96: { label: "Thunderstorm", emoji: "⛈️" },
  99: { label: "Thunderstorm", emoji: "⛈️" },
};

function wmo(code: number) {
  return WMO[code] ?? { label: "Unknown", emoji: "🌡️" };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DailyForecast {
  dayName: string;
  code: number;
  high: number;
  low: number;
  precipProb: number;
}

interface WeatherData {
  currentTemp: number;
  currentCode: number;
  windspeed: number;
  daily: DailyForecast[];
}

interface Props {
  onLoaded?: (summary: string) => void;
}

export default function WeatherWidget({ onLoaded }: Props) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function fetchWeather(lat: number, lon: number) {
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
          `&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`,
      )
        .then((r) => r.json())
        .then((d) => {
          const cw = d.current_weather;
          const dl = d.daily;
          const daily: DailyForecast[] = dl.time.map((dateStr: string, i: number) => {
            const date = new Date(dateStr + "T12:00:00");
            return {
              dayName: i === 0 ? "Today" : DAY_NAMES[date.getDay()],
              code: dl.weathercode[i],
              high: Math.round(dl.temperature_2m_max[i]),
              low: Math.round(dl.temperature_2m_min[i]),
              precipProb: dl.precipitation_probability_max[i] ?? 0,
            };
          });

          const weather: WeatherData = {
            currentTemp: Math.round(cw.temperature),
            currentCode: cw.weathercode,
            windspeed: Math.round(cw.windspeed),
            daily,
          };
          setData(weather);

          if (onLoaded) {
            const today = daily[0];
            const info = wmo(today.code);
            onLoaded(`${today.high}°F high, ${today.low}°F low, ${info.label}`);
          }
        })
        .catch(() => setError("Couldn't load weather data"));
    }

    const defaultLat = import.meta.env.VITE_DEFAULT_LAT;
    const defaultLon = import.meta.env.VITE_DEFAULT_LON;

    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      () => {
        if (defaultLat && defaultLon) {
          fetchWeather(parseFloat(defaultLat), parseFloat(defaultLon));
        } else {
          setError("Enable location access to see the weather forecast");
        }
      },
    );
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 text-slate-400 text-sm flex items-center gap-2">
        <span>🌡️</span>
        <span>{error}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 animate-pulse">
        <div className="flex items-center gap-8 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-800" />
            <div>
              <div className="h-10 w-28 bg-slate-800 rounded-lg mb-2" />
              <div className="h-4 w-20 bg-slate-800 rounded" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const todayInfo = wmo(data.currentCode);

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
      <div className="flex items-start gap-10 mb-5">
        <div className="flex items-center gap-4">
          <span className="text-5xl leading-none">{todayInfo.emoji}</span>
          <div>
            <p className="text-5xl font-light text-white leading-none">{data.currentTemp}°</p>
            <p className="text-sky-400 font-medium mt-1">{todayInfo.label}</p>
          </div>
        </div>
        <div className="text-slate-400 text-sm pt-1 space-y-0.5">
          <p>
            High <span className="text-slate-200">{data.daily[0].high}°</span> · Low{" "}
            <span className="text-slate-200">{data.daily[0].low}°</span>
          </p>
          <p>
            Wind <span className="text-slate-200">{data.windspeed} mph</span>
          </p>
          {data.daily[0].precipProb > 0 && (
            <p>
              Rain chance <span className="text-sky-400">{data.daily[0].precipProb}%</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 lg:gap-3">
        {data.daily.map((day, i) => {
          const info = wmo(day.code);
          return (
            <div
              key={i}
              className={`flex flex-col items-center gap-2 rounded-xl py-3 px-2 lg:py-4 lg:px-3 xl:py-5 xl:px-4 ${
                i === 0
                  ? "bg-sky-950/60 border border-sky-800/50"
                  : "bg-slate-800/50 border border-transparent"
              }`}
            >
              <p className={`text-xs md:text-sm lg:text-base xl:text-lg font-semibold truncate w-full text-center ${i === 0 ? "text-sky-400" : "text-slate-400"}`}>
                {day.dayName}
              </p>
              <span className="text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl leading-none">{info.emoji}</span>
              <p className="text-sm md:text-base lg:text-xl xl:text-2xl 2xl:text-3xl font-bold text-slate-100">{day.high}°</p>
              <p className="text-xs md:text-sm lg:text-base xl:text-lg 2xl:text-xl text-slate-500">{day.low}°</p>
              {day.precipProb > 20 && (
                <p className="text-[10px] md:text-xs lg:text-sm xl:text-base text-sky-500 font-medium">{day.precipProb}%</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
