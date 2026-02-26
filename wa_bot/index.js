const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const { getSession, setSession, clearSession } = require('./state_store');

// === Config ===
const RAG_URL = 'http://127.0.0.1:8000/ask';
const ASSETS_DIR = path.join(__dirname, 'assets');

// === ARCHIVOS MULTIMEDIA ===
const IMG_PASO_1 = path.join(ASSETS_DIR, 'fer_ru.jpeg');
const IMG_FERNANDO = path.join(ASSETS_DIR, 'fernando.jpeg'); 
const IMG_RUBEN = path.join(ASSETS_DIR, 'ruben.jpeg');       
const DOC_TRIPTICO = path.join(ASSETS_DIR, 'triptico_propuestas_ruben.pdf');

// === TEXTO DE REDES SOCIALES ===
const REDES_SOCIALES = `🔹 *Redes oficiales del MATE*
📘 Facebook:
https://www.facebook.com/profile.php?id=61572264922531
📸 Instagram:
https://www.instagram.com/mate.oficial26?igsh=anB2cHFndndyZndx
🎵 TikTok:
https://www.tiktok.com/@mate_somostodos?_r=1&_t=ZM-932zHsqL0Ul

🔹 *Redes oficiales del candidato a Alcalde*
👤 Fernando Nolberto León Alemán
📘 Facebook:
https://www.facebook.com/profile.php?id=100010047572994
📸 Instagram:
https://www.instagram.com/fernandoleon401?igsh=Znp6ajdqNWNpZmo1
🎵 TikTok:
https://www.tiktok.com/@fernandoleon.oficial?is_from_webapp=1&sender_device=pc

🔹 *Redes oficiales del candidato a Ejecutivo de Desarrollo*
👤 Ruben Vaca Salazar
📘 Facebook:
https://www.facebook.com/RubenVaca.V.M/?locale=es_LA`;

// --- Utilidades de texto ---
function normalize(s) { return (s || '').trim(); }
function normLower(s) { return normalize(s).toLowerCase(); }
function stripAccents(s) { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function containsAbuse(text) {
  const t = stripAccents(normLower(text));
  const bad = [
    'puta','puto','mierda','carajo','verga','concha','pelotudo','pelotuda',
    'boludo','boluda','imbecil','idiota','estupido','estupida','pendejo','pendeja',
    'hijo de puta','hdp','burro','cabron','inutil','huevon','maricon','maleante',
    'ladron','ratero'
  ];
  return bad.some(w => t.includes(w));
}

// Detectores de Sí / No y Despedida
function isYes(text) {
  const t = normLower(text);
  return ['si','sí','s','claro','ok','dale','de una','por supuesto','quiero','okey'].some(x => t === x || t.includes(x));
}
function isNo(text) {
  const t = normLower(text);
  return ['no','n','nop','no gracias','para nada'].some(x => t === x || t.includes(x));
}
function looksLikeClosing(text) {
  const t = normLower(text);
  return [
    'eso es todo','nada mas','nada más','listo','ok gracias','gracias','muchas gracias',
    'chau','chao','adios','adiós','bye', 'hasta luego', 'nos vemos', 'excelente'
  ].some(x => t === x || t.includes(x));
}

// Delay humano (pausas más cortas para que sea más rápido)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cola por chat
const queues = new Map();
function enqueue(chatId, fn) {
  const prev = queues.get(chatId) || Promise.resolve();
  const next = prev
    .then(fn)
    .catch((err) => console.error('[QUEUE ERROR]', err))
    .finally(() => {
      if (queues.get(chatId) === next) queues.delete(chatId);
    });
  queues.set(chatId, next);
  return next;
}

// Función para consultar a Python con memoria por usuario
async function askRAG(chatId, question) {
  // Aumentamos el límite de espera a 3 minutos (180000ms) por si tu PC se pone lenta, así no da error
  const r = await axios.post(RAG_URL, { chat_id: chatId, question }, { timeout: 180000 });
  const answer = r.data?.answer;
  return answer ? String(answer) : 'No tengo esa información en este momento.';
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('Escanea el QR (WhatsApp → Dispositivos vinculados):');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('[CONN] closed. status =', statusCode, 'reconnect =', shouldReconnect);
      if (shouldReconnect) start();
      else console.log('Sesión cerrada (logged out). Borra la carpeta ./auth y vuelve a escanear.');
    }

    if (connection === 'open') {
      console.log('[CONN] Bot de MATE conectado y 100% conversacional.');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages?.[0];
    if (!msg || msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;
    if (!chatId || chatId.endsWith('@g.us')) return; 

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      '';

    const userText = (text || '').trim();
    if (!userText) return;

    await enqueue(chatId, async () => {
      console.log('[IN]', { chatId, userText });

      let session = getSession(chatId);

      // 1. VERIFICAR SI ES UN USUARIO NUEVO
      if (!session) {
        session = { step: 'ASK_TRIPTICO' };
        setSession(chatId, session);
        
        const introText = "¡Hola! Soy el Asistente Virtual oficial de la agrupación ciudadana MATE 🧉.\n\nEstoy aquí para contarte las propuestas de nuestros candidatos: *Fernando León* (Alcalde) y *Rubén Vaca* (Ejecutivo de Desarrollo).";

        if (fs.existsSync(IMG_PASO_1)) {
          await sock.sendMessage(chatId, { image: fs.readFileSync(IMG_PASO_1), caption: introText });
        } else {
          await sock.sendMessage(chatId, { text: introText });
        }
        
        if (fs.existsSync(IMG_FERNANDO)) {
          await sleep(500); // Pausa reducida
          await sock.sendMessage(chatId, { image: fs.readFileSync(IMG_FERNANDO), caption: "👨🏻‍🌾 Fernando León - Candidato a Alcalde \n Fernando León es orgullosamente villamontino, vecino del Barrio Bolívar y comprometido con el servicio a su gente. Estudió Agronomía en la Universidad Autónoma Juan Misael Saracho (UAJMS), formación que fortaleció su visión sobre el desarrollo productivo y rural de la región. Amante de la música y el fútbol, defensor de las tradiciones chaqueñas y del asado criollo, impulsa un liderazgo cercano, transparente y enfocado en el progreso de Villa Montes." });
        }

        if (fs.existsSync(IMG_RUBEN)) {
          await sleep(500); // Pausa reducida
          await sock.sendMessage(chatId, { image: fs.readFileSync(IMG_RUBEN), caption: "🤝 Rubén Vaca - Candidato a Ejecutivo de Desarrollo \n Rubén Vaca es un villamontino comprometido con su tierra y con la identidad chaqueña. Cercano a la gente y con experiencia en gestión regional, impulsa un liderazgo basado en trabajo y resultados. Su visión es fortalecer el desarrollo productivo, generar oportunidades y consolidar una gestión transparente que proyecte a Villa Montes hacia un futuro de crecimiento y bienestar para todos." });
        }

        await sleep(800);
        await sock.sendMessage(chatId, { text: "Por cierto, ¿te gustaría que te envíe el *tríptico resumen* de la campaña? (Responde *SÍ* o *NO*)" });

        return; 
      }

      // 2. Comando oculto para reiniciar
      if (userText.toLowerCase() === '/reset') {
        clearSession(chatId);
        try { await askRAG(chatId, '/reset'); } catch (e) { }
        await sock.sendMessage(chatId, { text: 'Conversación y memoria reiniciadas. Escribe un mensaje para comenzar otra vez.' });
        return;
      }

      // 3. Filtro de insultos frontal
      if (containsAbuse(userText)) {
        await sleep(500);
        await sock.sendMessage(chatId, { text: "Entiendo que la política a veces genera frustración, pero en la agrupación MATE priorizamos el diálogo con respeto. ¿En qué más podemos ayudarte para mejorar Villa Montes?" });
        return;
      }

      // 4. --- INTERCEPTAR PREGUNTA DEL TRÍPTICO ---
      if (session.step === 'ASK_TRIPTICO') {
        session.step = 'RAG';
        setSession(chatId, session);

        if (isYes(userText)) {
          if (fs.existsSync(DOC_TRIPTICO)) {
            const ext = path.extname(DOC_TRIPTICO).toLowerCase();
            if (ext === '.pdf') {
               await sock.sendMessage(chatId, { 
                 document: fs.readFileSync(DOC_TRIPTICO), 
                 mimetype: 'application/pdf', 
                 fileName: 'Triptico_MATE.pdf',
                 caption: "¡Aquí tienes nuestro tríptico de campaña! 🧉"
               });
            } else {
               await sock.sendMessage(chatId, { 
                 image: fs.readFileSync(DOC_TRIPTICO), 
                 caption: "¡Aquí tienes nuestro tríptico de campaña! 🧉" 
               });
            }
          } else {
            await sock.sendMessage(chatId, { text: "¡Uy! En este momento se me traspapeló el archivo, mil disculpas." });
          }
          await sleep(800);
          await sock.sendMessage(chatId, { text: "¿De quién te gustaría conocer el plan a detalle o sobre qué tema tienes dudas?" });
          return;
        } 
        else if (isNo(userText)) {
          await sock.sendMessage(chatId, { text: "¡Entendido! ¿De quién te gustaría conocer el plan a detalle o sobre qué tema tienes dudas?" });
          return;
        }
      }

      // 5. --- MODO RAG 100% ---
      try {
        await sock.sendPresenceUpdate('composing', chatId);
        
        // Petición al LLM (Aquí es donde la PC toma su tiempo)
        let answer = await askRAG(chatId, userText);

        await sock.sendPresenceUpdate('paused', chatId);

        if (answer.length > 2000) answer = answer.slice(0, 2000) + '\n\n... (Mensaje cortado por longitud)';

        await sock.sendMessage(chatId, { text: answer });

        // Redes Sociales
        if (looksLikeClosing(userText)) {
          await sleep(1000); 
          await sock.sendMessage(chatId, { 
            text: "¡Te invito a seguirnos en nuestras redes sociales para enterarte de todas las novedades!\n\n" + REDES_SOCIALES 
          });
        }

      } catch (e) {
        console.error('[RAG ERROR]', e?.message || e);
        await sock.sendPresenceUpdate('paused', chatId);
        await sock.sendMessage(chatId, { text: 'Tuve un pequeño problema de conexión, mi sistema está procesando mucha información. ¿Puedes repetirme tu consulta por favor?' });
      }
    });
  });
}

start().catch((e) => console.error('Fatal:', e));