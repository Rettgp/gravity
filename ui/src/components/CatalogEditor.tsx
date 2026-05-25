import { useState, useEffect } from "react";

interface Item {
  id: number;
  description: string;
  category: string;
  seasons: string[];
  occasions: string[];
  colors: string[];
}

interface EditState {
  description: string;
  colors: string;
  category: string;
}

interface Props {
  onClose: () => void;
}

const CATEGORY_ORDER = ["tops", "bottoms", "outerwear", "shoes", "dress", "suit", "accessories"];

export default function CatalogEditor({ onClose }: Props) {
  const [personLabel, setPersonLabel] = useState("garrett");
  const [persons, setPersons] = useState<{ label: string; display_name: string }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch("/api/wardrobe/persons")
      .then((r) => r.json())
      .then((d) => {
        setPersons(d.persons ?? []);
        if (d.persons?.length > 0) setPersonLabel(d.persons[0].label);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!personLabel) return;
    setItems([]);
    fetch(`/api/wardrobe/catalog/${personLabel}`)
      .then((r) => r.json())
      .then((d) => {
        const fetched: Item[] = d.items ?? [];
        setItems(fetched);
        const init: Record<number, EditState> = {};
        for (const item of fetched) {
          init[item.id] = { description: item.description, colors: item.colors.join(", "), category: item.category };
        }
        setEdits(init);
        setSaved({});
      });
  }, [personLabel]);

  function handleChange(id: number, field: keyof EditState, value: string) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setSaved((prev) => ({ ...prev, [id]: false }));
  }

  async function handleSave(id: number) {
    const edit = edits[id];
    if (!edit) return;
    setSaving((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/wardrobe/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: edit.description,
          colors: edit.colors
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
          category: edit.category,
        }),
      });
      if (res.ok) {
        setSaved((prev) => ({ ...prev, [id]: true }));
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  description: edit.description,
                  colors: edit.colors
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean),
                  category: edit.category,
                }
              : item
          )
        );
      }
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  }

  const grouped = CATEGORY_ORDER.reduce<Record<string, Item[]>>((acc, cat) => {
    const group = items.filter((i) => i.category === cat);
    if (group.length) acc[cat] = group;
    return acc;
  }, {});
  const uncategorized = items.filter((i) => !CATEGORY_ORDER.includes(i.category));
  if (uncategorized.length) grouped["other"] = uncategorized;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <span className="text-slate-100 font-semibold text-lg">Catalog Editor</span>
          {persons.length > 1 && (
            <select
              value={personLabel}
              onChange={(e) => setPersonLabel(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {persons.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.display_name}
                </option>
              ))}
            </select>
          )}
          <span className="text-slate-500 text-sm">{items.length} items</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 transition-colors text-sm px-3 py-1 rounded-md hover:bg-slate-800"
        >
          ✕ Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {items.length === 0 && (
          <p className="text-slate-500 text-sm mt-8 text-center">Loading items…</p>
        )}

        {Object.entries(grouped).map(([category, group]) => (
          <section key={category} className="mb-8">
            <h2 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">
              {category}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {group.map((item) => {
                const edit = edits[item.id] ?? { description: item.description, colors: item.colors.join(", "), category: item.category };
                const isDirty =
                  edit.description !== item.description ||
                  edit.colors !== item.colors.join(", ") ||
                  edit.category !== item.category;
                return (
                  <div
                    key={item.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-2"
                  >
                    <div className="flex gap-3">
                      <img
                        src={`/api/wardrobe/image/${item.id}`}
                        alt={item.description}
                        className="w-20 h-20 object-cover rounded-lg bg-slate-800 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <span className="text-xs text-slate-500">ID {item.id}</span>
                        <div className="flex flex-wrap gap-1">
                          {item.seasons.map((s) => (
                            <span key={s} className="text-xs bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">
                              {s}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.occasions.map((o) => (
                            <span key={o} className="text-xs bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">
                              {o}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-400">Category</label>
                      <select
                        value={edit.category}
                        onChange={(e) => handleChange(item.id, "category", e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {CATEGORY_ORDER.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-400">Description</label>
                      <textarea
                        rows={2}
                        value={edit.description}
                        onChange={(e) => handleChange(item.id, "description", e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-400">Colors (comma-separated)</label>
                      <input
                        type="text"
                        value={edit.colors}
                        onChange={(e) => handleChange(item.id, "colors", e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <button
                      disabled={!isDirty || saving[item.id]}
                      onClick={() => handleSave(item.id)}
                      className={`mt-1 self-end px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        saved[item.id]
                          ? "bg-green-700 text-green-100"
                          : isDirty
                          ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                          : "bg-slate-800 text-slate-600 cursor-default"
                      }`}
                    >
                      {saving[item.id] ? "Saving…" : saved[item.id] ? "Saved ✓" : "Save"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
