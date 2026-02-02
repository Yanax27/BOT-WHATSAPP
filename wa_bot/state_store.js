const fs = require('fs');
const path = require('path');

const STATE_DIR = path.join(__dirname, 'state');
const STATE_FILE = path.join(STATE_DIR, 'sessions.json');

function ensure() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify({}, null, 2), 'utf8');
}

function loadAll() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveAll(all) {
  ensure();
  fs.writeFileSync(STATE_FILE, JSON.stringify(all, null, 2), 'utf8');
}

function getSession(chatId) {
  const all = loadAll();
  return all[chatId] || null;
}

function setSession(chatId, session) {
  const all = loadAll();
  all[chatId] = session;
  saveAll(all);
}

function clearSession(chatId) {
  const all = loadAll();
  delete all[chatId];
  saveAll(all);
}

module.exports = { getSession, setSession, clearSession };
