import os
from typing import TypedDict
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, END

from source_obsidian.embedder import get_embedder
from source_obsidian.store import similarity_search


def _get_llm() -> ChatOllama:
    return ChatOllama(
        model=os.environ["OLLAMA_MODEL"],
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
    )


class ChatState(TypedDict):
    question: str
    history: list[dict]
    context: str
    sources: list[str]
    answer: str


def _retrieve(state: ChatState) -> ChatState:
    embedder = get_embedder()
    docs = similarity_search(state["question"], embedder, k=5)
    state["context"] = "\n\n".join(d.page_content for d in docs)
    state["sources"] = [d.metadata.get("source", "") for d in docs]
    return state


def _generate(state: ChatState) -> ChatState:
    llm = _get_llm()
    system = (
        "You are a helpful family assistant. Answer the question using only the "
        "context below. If the answer isn't in the context, say you do not know.\n\n"
        f"Context:\n{state['context']}"
    )
    messages = [SystemMessage(content=system)]
    for turn in state.get("history", []):
        messages.append(
            HumanMessage(content=turn["content"])
            if turn["role"] == "user"
            else AIMessage(content=turn["content"])
        )
    messages.append(HumanMessage(content=state["question"]))

    response = llm.invoke(messages)
    state["answer"] = response.content
    return state


def build_pipeline():
    graph = StateGraph(ChatState)
    graph.add_node("retrieve", _retrieve)
    graph.add_node("generate", _generate)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", END)
    return graph.compile()


pipeline = build_pipeline()
