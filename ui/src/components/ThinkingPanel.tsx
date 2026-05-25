import { useState } from "react";

export interface ThinkingStep {
  step_type: "thought" | "action" | "observation";
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
}

interface Props {
  steps: ThinkingStep[];
  done: boolean;
}

export default function ThinkingPanel({ steps, done }: Props) {
  const [expanded, setExpanded] = useState(!done);

  if (steps.length === 0) return null;

  const toolCount = steps.filter((s) => s.step_type === "action").length;

  return (
    <div className="max-w-[85%] my-1 text-xs select-none">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors w-full text-left py-0.5"
      >
        {!done && (
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
        )}
        <span className={done ? "text-gray-600" : "text-gray-400"}>
          {done
            ? toolCount > 0
              ? `Checked ${toolCount} tool${toolCount !== 1 ? "s" : ""}`
              : "Done thinking"
            : "Thinking…"}
        </span>
        <span className="ml-auto text-gray-700 text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-1 rounded-lg bg-gray-950 border border-gray-800 p-2.5 space-y-2 font-mono">
          {steps.map((step, i) => {
            if (step.step_type === "thought") {
              return (
                <p key={i} className="text-gray-500 italic text-[11px] leading-relaxed">
                  {step.content}
                </p>
              );
            }
            if (step.step_type === "action") {
              return (
                <div key={i} className="text-[11px]">
                  <span className="text-indigo-400 font-semibold">→ {step.tool}</span>
                  {step.args && Object.keys(step.args).length > 0 && (
                    <pre className="text-gray-600 text-[10px] mt-0.5 whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(step.args, null, 2)}
                    </pre>
                  )}
                </div>
              );
            }
            if (step.step_type === "observation") {
              return (
                <p
                  key={i}
                  className="text-gray-600 text-[10px] pl-2 border-l border-gray-800 leading-relaxed line-clamp-4"
                >
                  {step.content}
                </p>
              );
            }
            return null;
          })}

          {!done && (
            <div className="flex gap-1 pt-0.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="inline-block w-1 h-1 rounded-full bg-gray-600 animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
