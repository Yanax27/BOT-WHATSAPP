import os
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "..", "data")
STORAGE_DIR = os.path.join(BASE_DIR, "storage")

def main():
    llm = Ollama(model="mistral:7b")
    embed = OllamaEmbedding(model_name="nomic-embed-text")

    docs = SimpleDirectoryReader(DATA_DIR).load_data()
    index = VectorStoreIndex.from_documents(docs, llm=llm, embed_model=embed)

    index.storage_context.persist(persist_dir=STORAGE_DIR)
    print("✔ Índice creado correctamente")

if __name__ == "__main__":
    main()
