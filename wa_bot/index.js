const axios = require('axios');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, 'assets');

const IMG_PASO_1 = path.join(ASSETS_DIR, 'paso1_intro.jpg');
const IMG_PASO_10 = path.join(ASSETS_DIR, 'paso10_final.jpg');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const { getSession, setSession, clearSession } = require('./state_store');
const { newSession, handleIncoming, MSG } = require('./flow');

// Si quieres fallback a RAG para preguntas fuera del flujo:
const RAG_URL = 'http://127.0.0.1:8000/ask';

// Delay humano
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

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
      console.log('Tip: escribe /reset para reiniciar una conversación.');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages?.[0];
    if (!msg) return;
    if (msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;
    if (!chatId) return;

    // ignorar grupos
    if (chatId.endsWith('@g.us')) return;

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

      // Si no existe sesión, creamos y enviamos Paso 1 automáticamente
      if (!session) {
        session = newSession();
        setSession(chatId, session);

        await sleep(randInt(1200, 2500));

        // Enviar imagen + texto (PASO 1)
        await sock.sendMessage(chatId, {
          image: fs.readFileSync(IMG_PASO_1),
          caption: MSG.paso1
        });
      }


      // Procesar flujo
      const result = handleIncoming(session, userText);

      if (result.reset) {
        clearSession(chatId);
        await sock.sendMessage(chatId, { text: result.reply });
        return;
      }

      // Guardar sesión actualizada
      if (result.session) {
        session = result.session;
        setSession(chatId, session);
      }

      // Responder
      if (result.reply) {
        await sleep(randInt(1500, 4500));

        // Si llegamos al PASO 10 → enviar imagen final + texto
        if (session.step === 10 && fs.existsSync(IMG_PASO_10)) {
          await sock.sendMessage(chatId, {
            image: fs.readFileSync(IMG_PASO_10),
            caption: result.reply
          });
        } else {
          await sock.sendMessage(chatId, { text: result.reply });
        }

        return;
      }

      // (Opcional) fallback a RAG si no hay reply (en este flujo casi siempre hay)
      // const r = await axios.post(RAG_URL, { question: userText }, { timeout: 120000 });
      // await sock.sendMessage(chatId, { text: r.data?.answer || 'No tengo esa información.' });
    });
  });
}

start().catch((e) => console.error('Fatal:', e));
