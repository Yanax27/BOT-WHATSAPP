# BOT-WHATSAPP
🤖 WhatsApp AI Bot (RAG Local con Ollama)  Este proyecto implementa un bot de WhatsApp que responde mensajes en lenguaje natural utilizando modelos de lenguaje open-source ejecutados localmente (sin depender de servicios externos) y una arquitectura RAG (Retrieval-Augmented Generation) basada en información proporcionada por el usuario


Este proyecto es un asistente virtual para WhatsApp impulsado por Inteligencia Artificial (RAG). respondiendo consultas sobre las propuestas de los candidatos (Alcalde)

---

## 🚀 Requisitos Previos

Antes de ejecutar el proyecto, asegúrate de tener instalado en tu computadora:
1. **Node.js** (v18 o superior)
2. **Python** (v3.9 o superior)
3. **Ollama** (Descargado desde ollama.com)

Abre una terminal y descarga los modelos locales de Inteligencia Artificial ejecutando estos dos comandos:
\`\`\`bash
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
\`\`\`

---

## ⚙️ Paso 1: Instalación (Solo la primera vez)

Si es la primera vez que vas a correr el proyecto en la computadora, instala las dependencias de ambos entornos.

**1. Instalar dependencias de Python (API):**
Abre una terminal, entra a la carpeta `rag_api` y ejecuta:
\`\`\`bash
cd rag_api
python -m venv venv
# En Windows activa el entorno con: venv\Scripts\activate
# En Mac/Linux activa el entorno con: source venv/bin/activate
pip install -r requirements.txt
\`\`\`

**2. Instalar dependencias de Node.js (Bot de WhatsApp):**
Abre otra terminal, entra a la carpeta `wa_bot` y ejecuta:
\`\`\`bash
cd wa_bot
npm install
\`\`\`

---

## ⚡ Paso 2: Cómo iniciar el proyecto (El Día a Día)

Para que el bot funcione, necesitas tener **dos terminales abiertas al mismo tiempo**: una para el "cerebro" (Python) y otra para el WhatsApp (Node.js). Sigue este orden exacto:

### Acción A: Entrenar a la IA con las propuestas (Ingesta)
**⚠️ IMPORTANTE:** Solo necesitas correr este comando si modificaste los archivos `fernando_leon.md` o `ruben_vaca.md` en la carpeta `data`.
En la terminal de Python (asegúrate de tener el entorno virtual activado), ejecuta:
\`\`\`bash
python ingest.py
\`\`\`
*(Espera a que la consola te confirme que el índice fue creado correctamente).*

### Acción B: Levantar la API de Inteligencia Artificial
Esta es la conexión que permite a la IA pensar y responder. En la misma terminal de Python, ejecuta:
\`\`\`bash
uvicorn server:app --reload
\`\`\`
*(Verás un mensaje indicando que el servidor está corriendo en `http://127.0.0.1:8000`. ¡NO cierres esta terminal!)*

### Acción C: Levantar el Bot de WhatsApp (Frontend)
Abre tu segunda terminal (la de Node.js), asegúrate de estar en la carpeta `wa_bot` y ejecuta:
\`\`\`bash
node index.js
\`\`\`
*(La terminal te mostrará un Código QR. Abre tu WhatsApp, ve a "Dispositivos vinculados" y escanea el QR. Una vez diga "Bot de MATE conectado", ¡el sistema está 100% operativo!)*

---

## 📂 Estructura de Carpetas

\`\`\`text
/tu_proyecto
│
├── /rag_api                # Backend (Inteligencia Artificial)
│   ├── /data               # Aquí van los archivos fernando_leon.md y ruben_vaca.md
│   ├── /storage            # Memoria vectorial generada por ingest.py
│   ├── ingest.py           # Script para ENTRENAR la IA
│   ├── server.py           # Script para LEVANTAR la API
│   └── requirements.txt    # Librerías de Python
│
└── /wa_bot                 # Frontend (WhatsApp)
    ├── /assets             # Imágenes (fer_ru.jpeg, fernando.jpeg, ruben.jpeg) y triptico.pdf
    ├── /auth               # Sesión guardada de WhatsApp
    ├── /state              # Memoria de usuarios saludados
    ├── index.js            # Script para LEVANTAR el bot
    └── package.json        # Librerías de Node.js
\`\`\`

---

## 💬 Funciones Principales

- **Presentación Visual:** Al iniciar, el bot envía fotos de los candidatos y pregunta si el vecino desea el tríptico en PDF.
- **Memoria Contextual:** Recuerda de qué candidato se está hablando durante la charla.
- **Comando `/reset`:** Si el usuario escribe `/reset`, el bot borra su memoria temporal y reinicia la conversación como si fuera un contacto nuevo (ideal para pruebas).
- **Cierre Automático:** Si el vecino se despide ("gracias", "chau", "listo"), el bot detecta la despedida y envía automáticamente los enlaces a las redes sociales oficiales.

---

## ⚠️ Solución de Problemas Comunes

- **El bot de WhatsApp se desconectó y da error en la terminal:** Detén Node.js (Ctrl+C), borra la carpeta `/auth` que está dentro de `wa_bot`, vuelve a correr `node index.js` y escanea el QR de nuevo.
- **La IA tarda mucho en responder:** Asegúrate de tener cerrada cualquier otra aplicación pesada en la computadora; Ollama consume bastante memoria RAM local.