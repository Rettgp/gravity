import os
from pathlib import Path

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_ollama import ChatOllama

from agents.family_docs import search_family_docs


def _get_llm() -> ChatOllama:
    return ChatOllama(
        model=os.environ["OLLAMA_MODEL"],
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
    )


def _load_prompt() -> str:
    path = Path(os.environ.get("PIPELINE_PROMPT_FILE", "prompts/pipeline.md"))
    return path.read_text(encoding="utf-8")


def _extract_sources(messages: list) -> list[str]:
    sources = []
    for msg in messages:
        if isinstance(msg, ToolMessage):
            for line in msg.content.split("\n"):
                stripped = line.strip()
                if stripped.startswith("[") and stripped.endswith("]"):
                    source = stripped[1:-1]
                    if source not in sources:
                        sources.append(source)
    return sources


class Pipeline:
    def __init__(self) -> None:
        self._agent = None

    def _get_agent(self):
        if self._agent is None:
            self._agent = create_agent(
                _get_llm(),
                [search_family_docs],
                system_prompt=_load_prompt(),
            )
        return self._agent

    async def ainvoke(self, state: dict) -> dict:
        messages = []
        for turn in state.get("history", []):
            if turn["role"] == "user":
                messages.append(HumanMessage(content=turn["content"]))
            else:
                messages.append(AIMessage(content=turn["content"]))
        messages.append(HumanMessage(content=state["question"]))

        result = await self._get_agent().ainvoke({"messages": messages})
        answer = result["messages"][-1].content
        sources = _extract_sources(result["messages"])

        return {**state, "answer": answer, "sources": sources}


pipeline = Pipeline()
