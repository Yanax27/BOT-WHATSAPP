const axios = require('axios');
const qrcode = require('qrcode-terminal');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const RAG_URL = 'http://127.0.0.1:8000/ask';

// utilidades
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// cola por chat (evita paralelismo)
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

  // Mostrar QR
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
    }
  });

  // Recibir mensajes
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages?.[0];
      if (!msg) return;
      if (msg.key.fromMe) return; // ignora mensajes enviados por ti mismo

      const chatId = msg.key.remoteJid; // ejemplo: 5917xxxx@s.whatsapp.net
      if (!chatId) return;

      // ignora grupos
      if (chatId.endsWith('@g.us')) return;

      // extraer texto
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      const question = (text || '').trim();
      if (!question) return;

      console.log('[IN]', { chatId, question });

      await enqueue(chatId, async () => {
        // delay humano
        await sleep(randInt(2500, 6500));

        // Llamar al RAG
        console.log('[CALL RAG]', question);
        let answer = 'No pude responder en este momento.';

        try {
          const r = await axios.post(RAG_URL, { question }, { timeout: 120000 });
          console.log('[RAG OK]', r.status);
          answer = r.data?.answer || answer;
        } catch (e) {
          console.error('[RAG ERROR]', e?.message || e);
          answer = 'Tuve un problema técnico consultando la información. Intenta nuevamente.';
        }

        if (typeof answer === 'string' && answer.length > 900) {
          answer = answer.slice(0, 900) + '…';
        }

        console.log('[SEND]', String(answer).slice(0, 80));

        // enviar mensaje
        await sock.sendMessage(chatId, { text: String(answer) });
        console.log('[SEND OK]');
      });

    } catch (e) {
      console.error('[HANDLER ERROR]', e?.message || e);
    }
  });
}

start().catch((e) => console.error('Fatal:', e));
