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
const { newSession, handleIncoming, MSG, containsAbuse } = require('./flow');

// === Config ===
const RAG_URL = 'http://127.0.0.1:8000/ask';

const ASSETS_DIR = path.join(__dirname, 'assets');
const IMG_PASO_1 = path.join(ASSETS_DIR, 'fernandoleon.png');
// ✅ Ya no usamos imagen final en step 10, pero dejamos la variable por si querés
// const IMG_PASO_10 = path.join(ASSETS_DIR, 'paso10_final.jpeg');

// Delay humano (corto)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Cola por chat (evita paralelismo)
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

// RAG solo después de terminar el flujo
function shouldUseRAG(userText) {
  const t = (userText || '').trim().toLowerCase();
  if (!t) return false;
  if (t === '/reset') return false;

  const smallTalk = [
    'hola','holaa','buenas','buenos dias','buen día','buen dia','que tal','q tal',
    'gracias','ok','dale','okey','👌'
  ];
  if (smallTalk.includes(t)) return false;

  // Si parece pregunta, sí
  const qWords = ['quien','quién','que','qué','cuando','cuándo','donde','dónde','como','cómo','por que','por qué','edad','nombre'];
  const looksLikeQuestion = t.includes('?') || t.includes('¿') || qWords.some(w => t.startsWith(w) || t.includes(` ${w} `));
  return looksLikeQuestion || t.length >= 28;
}

async function sendIntro(sock, chatId) {
  if (fs.existsSync(IMG_PASO_1)) {
    await sock.sendMessage(chatId, {
      image: fs.readFileSync(IMG_PASO_1),
      caption: MSG.paso1,
    });
  } else {
    await sock.sendMessage(chatId, { text: MSG.paso1 });
  }
}

async function askRAG(question) {
  const r = await axios.post(RAG_URL, { question }, { timeout: 120000 });
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
      else console.log('Sesión cerrada (logged out). Borra ./auth y vuelve a escanear.');
    }

    if (connection === 'open') {
      console.log('[CONN] Bot conectado y listo.');
      console.log('Tip: /reset reinicia la conversación.');
      console.log('IMG1 existe:', fs.existsSync(IMG_PASO_1));
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages?.[0];
    if (!msg) return;
    if (msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;
    if (!chatId) return;
    if (chatId.endsWith('@g.us')) return; // sin grupos

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

      // Crear sesión y mandar PASO 1 (imagen + caption)
      if (!session) {
        session = newSession();
        setSession(chatId, session);
        await sleep(randInt(500, 1100));
        await sendIntro(sock, chatId);
        // seguimos procesando el mensaje actual en el flujo
      }

      // Reset
      if (userText.toLowerCase() === '/reset') {
        clearSession(chatId);
        await sleep(randInt(400, 900));
        await sock.sendMessage(chatId, { text: 'Listo. Reiniciado. Escribe “hola” para comenzar.' });
        return;
      }

      // Bloqueo por insultos antes de cualquier cosa (extra seguridad)
      if (containsAbuse(userText)) {
        await sleep(randInt(500, 1100));
        await sock.sendMessage(chatId, { text: MSG.abuso });
        return;
      }

      // Flujo guiado primero
      const result = handleIncoming(session, userText);

      if (result.reset) {
        clearSession(chatId);
        await sleep(randInt(400, 900));
        await sock.sendMessage(chatId, { text: result.reply });
        return;
      }

      if (result.session) {
        session = result.session;
        setSession(chatId, session);
      }

      // ✅ Si flow dice "handoffToRag" o ya estás en step 10 y parece pregunta, ir a RAG
      const goRag =
        result.handoffToRag ||
        (session.step >= 10 && shouldUseRAG(userText));

      if (goRag) {
        console.log('[RAG]', userText);

        let answer = 'No pude responder en este momento.';
        try {
          answer = await askRAG(userText);
        } catch (e) {
          console.error('[RAG ERROR]', e?.message || e);
          answer = 'Tuve un problema técnico. Intenta de nuevo.';
        }

        if (answer.length > 900) answer = answer.slice(0, 900) + '…';

        await sleep(randInt(600, 1400));
        await sock.sendMessage(chatId, { text: answer });
        return;
      }

      // Si hay reply del flujo, responder (siempre texto)
      if (result.reply) {
        await sleep(randInt(700, 1600));
        await sock.sendMessage(chatId, { text: result.reply });
        return;
      }
    });
  });
}

start().catch((e) => console.error('Fatal:', e));