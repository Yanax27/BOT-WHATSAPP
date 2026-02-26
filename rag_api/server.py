import os
from fastapi import FastAPI
from pydantic import BaseModel

from llama_index.core import StorageContext, load_index_from_storage
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.core.memory import ChatMemoryBuffer

BASE_DIR = os.path.dirname(__file__)
STORAGE_DIR = os.path.join(BASE_DIR, "storage")

app = FastAPI()

class Question(BaseModel):
    chat_id: str
    question: str

global_index = None
global_llm = None
chat_engines = {}

SYSTEM_PROMPT = (
    "Eres el asistente virtual de la agrupación MATE en Villa Montes. Responde SIEMPRE en plural ('nosotros'). "
    "INSTRUCCIONES ESTRICTAS DE FORMATO (CUMPLE AL 100% Y NUNCA DES DETALLES NO SOLICITADOS): \n\n"
    "REGLA 1 - PLAN DE FERNANDO LEÓN: "
    "Si el usuario pide el plan de Fernando León de forma general, RESPONDE EXACTAMENTE CON ESTA LISTA:\n"
    "Para nuestro candidato a Alcalde, Fernando León, los ejes son:\n"
    "- *Eje 1:* Municipio Transparente y Cerca de Ti\n"
    "- *Eje 2:* Más Trabajo y Apoyo al Que Produce\n"
    "- *Eje 3:* Obras que Cambian tu Vida\n"
    "- *Eje 4:* Educación y Salud de Primera\n"
    "- *Eje 5:* Medio Ambiente que Genera Recursos\n"
    "- *Eje 6:* Villa Montes te Espera (Turismo)\n"
    "- *Eje 7:* Ordenando y Regularizando el Territorio\n"
    "¿Qué eje de Fernando te interesa que detallemos?\n\n"
    "REGLA 2 - PLAN DE RUBÉN VACA: "
    "Si el usuario pide el plan de Rubén Vaca de forma general, RESPONDE EXACTAMENTE CON ESTA LISTA:\n"
    "Para nuestro candidato a Ejecutivo, Rubén Vaca, este es el plan:\n"
    "- *1. Salud:* Hospital Fray Quebracho 24/7\n"
    "- *2. Agua:* Embalses y riego tecnificado\n"
    "- *3. Caminos:* Reactivación del SERECA\n"
    "- *4. Adulto Mayor:* Centro devuelto y canasta digna\n"
    "- *5. Fondo Rotatorio:* Reposición y créditos\n"
    "- *6. Empleo:* 1.500 trabajos en defensivos del Pilcomayo\n"
    "- *7. Energía:* Parques solares\n"
    "- *8. Indígenas:* Cogestión ambiental\n"
    "- *9. Cultura:* Recuperación del patrimonio\n"
    "¿Sobre cuál punto de Rubén te gustaría saber más?\n\n"
    "REGLA 3 - TEMAS ESPECÍFICOS (SOLO AQUÍ DAS DETALLES): "
    "Si el usuario pregunta por un TEMA ESPECÍFICO (ej. 'eje 4', 'educación', 'agua'), "
    "lee la base de datos y explica las propuestas exactas usando viñetas. "
    "Usa la memoria de la conversación para recordar de qué candidato estaban hablando. "
    "NO repitas el menú general si ya te preguntaron por un tema.\n\n"
    "REGLA 4 - PREGUNTA SIN CONTEXTO: "
    "Si preguntan 'qué proponen' sin nombres ni temas, responde: 'En MATE tenemos propuestas claras. ¿Te gustaría conocer el plan del Alcalde, *Fernando León*, o del Ejecutivo, *Rubén Vaca*?'"
)

@app.on_event("startup")
def load_index():
    global global_index, global_llm
    # request_timeout lo subimos un poco por si la PC necesita más de 2 minutos
    global_llm = Ollama(model="qwen2.5:3b", request_timeout=240.0)
    embed = OllamaEmbedding(model_name="nomic-embed-text")
    storage = StorageContext.from_defaults(persist_dir=STORAGE_DIR)
    global_index = load_index_from_storage(storage, embed_model=embed)

def get_chat_engine(chat_id):
    if chat_id not in chat_engines:
        # OPTIMIZACIÓN 1: Reducimos la memoria a 1000 tokens para que no se sobrecargue el historial
        memory = ChatMemoryBuffer.from_defaults(token_limit=1000) 
        chat_engines[chat_id] = global_index.as_chat_engine(
            chat_mode="context",
            memory=memory,
            system_prompt=SYSTEM_PROMPT,
            llm=global_llm,
            # OPTIMIZACIÓN 2: top_k=2 significa que leemos menos trozos del PDF, más velocidad
            similarity_top_k=2 
        )
    return chat_engines[chat_id]

@app.post("/ask")
def ask(q: Question):
    if q.question.strip().lower() == "/reset":
        if q.chat_id in chat_engines:
            del chat_engines[q.chat_id]
        return {"answer": "Memoria borrada internamente."}

    engine = get_chat_engine(q.chat_id)
    res = engine.chat(q.question)
    return {"answer": str(res)}