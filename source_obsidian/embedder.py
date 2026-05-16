import os
from langchain_huggingface import HuggingFaceEmbeddings


def get_embedder() -> HuggingFaceEmbeddings:
    model_name = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    return HuggingFaceEmbeddings(model_name=model_name)
