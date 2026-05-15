import os
from langchain_community.embeddings import SentenceTransformerEmbeddings


def get_embedder() -> SentenceTransformerEmbeddings:
    model_name = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    return SentenceTransformerEmbeddings(model_name=model_name)
