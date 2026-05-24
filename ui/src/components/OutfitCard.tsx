interface OutfitItem {
  item_id: number;
  label: string;
  image_url: string;
  person_label?: string;
}

interface Props {
  items: OutfitItem[];
  dayLabel?: string;
}

export default function OutfitCard({ items, dayLabel }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="mt-2 rounded-xl bg-gray-900 p-3 border border-gray-700 max-w-[85%]">
      {dayLabel && (
        <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">
          {dayLabel}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <a
            key={item.item_id}
            href={item.image_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 group"
          >
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-800 border border-gray-700 group-hover:border-indigo-500 transition-colors">
              <img
                src={item.image_url}
                alt={item.label}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23374151'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%236b7280' font-size='10'%3ENo img%3C/text%3E%3C/svg%3E";
                }}
              />
            </div>
            <span className="text-xs text-gray-400 text-center max-w-[5rem] leading-tight line-clamp-2">
              {item.label}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
