import os
from fastapi import FastAPI
from pydantic import BaseModel

from llama_index.core import StorageContext, load_index_from_storage
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding

BASE_DIR = os.path.dirname(__file__)
STORAGE_DIR = os.path.join(BASE_DIR, "storage")

app = FastAPI()

class Question(BaseModel):
    question: str

query_engine = None

@app.on_event("startup")
def load_index():
    global query_engine

    # Fuerza LLM local (Ollama) y embeddings locales
    llm = Ollama(model="qwen2.5:3b", request_timeout=120.0)
    embed = OllamaEmbedding(model_name="nomic-embed-text")

    storage = StorageContext.from_defaults(persist_dir=STORAGE_DIR)
    index = load_index_from_storage(storage, embed_model=embed)

    # MUY IMPORTANTE: pasar llm aquí para que NO use OpenAI por defecto
    query_engine = index.as_query_engine(
        llm=llm,
        similarity_top_k=3
    )

@app.post("/ask")
def ask(q: Question):
    prompt = (
        "Responde SOLO con la información proporcionada en la base de conocimiento. "
        "Si no tienes datos suficientes, di claramente que no cuentas con esa información.\n\n"
        f"Pregunta: {q.question}"
    )
    res = query_engine.query(prompt)
    return {"answer": str(res)}
