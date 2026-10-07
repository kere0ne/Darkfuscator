'use strict';
/* db.js — JSON-file store with collections, in-memory indexes and atomic writes.
 *
 * Collections: users, sessions, tokens, projects, builds, apiKeys, securityEvents.
 * Blobs (build outputs and stored sources) live beside the db in blobs/.
 * Writes are debounced and atomic (temp file + rename), so a crash mid-write
 * never corrupts the store. This is a file store, not a database server: it is
 * real persistence for the platform, and it can be swapped for Postgres later
 * without touching the route layer.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DK_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BLOB_DIR = path.join(DATA_DIR, 'blobs');

const SCHEMA = {
  users: [], sessions: [], tokens: [], projects: [],
  builds: [], apiKeys: [], securityEvents: []
};

const CAPS = {
  securityEvents: 5000,
  sessions: 20000,
  tokens: 10000,
  builds: 100000,
  apiKeys: 20000,
  projects: 20000,
  users: 50000
};

const db = {};
let writeTimer = null;
let lastFlush = Date.now();

function load() {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { raw = null; }
  for (const name of Object.keys(SCHEMA)) {
    db[name] = raw && Array.isArray(raw[name]) ? raw[name] : [];
    if (db[name].length > CAPS[name]) db[name] = db[name].slice(-CAPS[name]);
  }
  try { fs.mkdirSync(BLOB_DIR, { recursive: true }); } catch (e) {}
}

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flush();
  }, 250);
  if (writeTimer.unref) writeTimer.unref();
}

function flush() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
    lastFlush = Date.now();
  } catch (e) { /* read-only disk: memory only */ }
}

// process shutdown: flush what is pending
for (const sig of ['SIGINT', 'SIGTERM']) {
  try {
    process.on(sig, () => { try { flush(); } catch (e) {} process.exit(0); });
  } catch (e) {}
}

function insert(coll, record) {
  db[coll].push(record);
  if (db[coll].length > CAPS[coll]) db[coll] = db[coll].slice(-CAPS[coll]);
  scheduleWrite();
  return record;
}

function find(coll, pred) {
  for (let i = db[coll].length - 1; i >= 0; i--) if (pred(db[coll][i])) return db[coll][i];
  return null;
}

function where(coll, pred) {
  return db[coll].filter(pred);
}

function remove(coll, pred) {
  let n = 0;
  for (let i = db[coll].length - 1; i >= 0; i--) {
    if (pred(db[coll][i])) { db[coll].splice(i, 1); n++; }
  }
  if (n) scheduleWrite();
  return n;
}

function update(coll, pred, patch) {
  let n = 0;
  for (const rec of db[coll]) {
    if (pred(rec)) { Object.assign(rec, patch); n++; }
  }
  if (n) scheduleWrite();
  return n;
}

// --------------------------------------------------------------------- blobs
function writeBlob(name, content) {
  try {
    fs.mkdirSync(BLOB_DIR, { recursive: true });
    fs.writeFileSync(path.join(BLOB_DIR, name), content);
    return true;
  } catch (e) { return false; }
}
function readBlob(name) {
  try { return fs.readFileSync(path.join(BLOB_DIR, name)); } catch (e) { return null; }
}
function deleteBlob(name) {
  try { fs.unlinkSync(path.join(BLOB_DIR, name)); return true; } catch (e) { return false; }
}

// legacy v6.1.0 stores (data/users.json, data/keys.json): import once on boot
function importLegacy() {
  if (find('users', (u) => u.legacyImported)) return 0;
  let imported = 0;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8'));
    for (const u of (raw.users || [])) {
      if (u && u.salt && u.hash && u.username) {
        const lk = String(u.username).toLowerCase();
        if (find('users', (x) => x.usernameLower === lk)) continue;
        insert('users', {
          id: 'usr_' + lk.slice(0, 6) + Math.random().toString(16).slice(2, 10),
          username: String(u.username),
          usernameLower: lk,
          email: '',
          emailLower: '',
          salt: u.salt,
          hash: u.hash,
          verified: true,           // grandfathered pre-email accounts
          pendingEmail: null,
          disabled: false,
          createdAt: u.createdAt || new Date().toISOString(),
          settings: defaultSettings(),
          legacyImported: true
        });
        imported++;
      }
    }
  } catch (e) {}
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'keys.json'), 'utf8'));
    for (const k of (raw.keys || [])) {
      if (k && typeof k.key === 'string' && k.key.startsWith('dk_live_')) {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(k.key).digest('hex');
        if (find('apiKeys', (x) => x.hash === hash)) continue;
        let owner = null;
        if (k.owner && find('users', (x) => x.usernameLower === k.owner)) owner = k.owner;
        insert('apiKeys', {
          id: 'key_' + Math.random().toString(16).slice(2, 12),
          userId: owner,
          username: owner,
          prefix: k.key.slice(0, 13),
          name: k.name || '',
          hash: hash,
          createdAt: k.createdAt || new Date().toISOString(),
          lastUsed: k.lastUsed || null,
          total: Number(k.total) || 0,
          revokedAt: null,
          requests: []
        });
        imported++;
      }
    }
  } catch (e) {}
  if (imported) {
    insert('users', { id: 'usr_legacy_mark', legacyImported: true, username: '__legacy_mark__',
      usernameLower: '__legacy_mark__', email: '', emailLower: '', salt: '', hash: '',
      verified: true, pendingEmail: null, disabled: false, createdAt: new Date().toISOString(),
      settings: defaultSettings() });
  }
  return imported;
}

function defaultSettings() {
  return {
    appearance: { theme: 'dark', accent: 'orange', compact: false },
    editor: { fontSize: 13, tabSize: 4, wordWrap: false, lineNumbers: true, highlighting: true },
    obfuscationDefaults: { target: 'roblox', preset: 'balanced', ir: 'balanced', vmMode: 'balanced', compression: true },
    notifications: { buildCompletion: true, securityAlerts: true }
  };
}

function writable() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const probe = path.join(DATA_DIR, '.probe');
    fs.writeFileSync(probe, String(Date.now()));
    fs.unlinkSync(probe);
    return true;
  } catch (e) { return false; }
}

load();

module.exports = {
  insert, find, where, remove, update, flush,
  writeBlob, readBlob, deleteBlob, importLegacy,
  defaultSettings, writable,
  users: () => db.users, sessions: () => db.sessions, tokens: () => db.tokens,
  projects: () => db.projects, builds: () => db.builds, apiKeys: () => db.apiKeys,
  securityEvents: () => db.securityEvents
};
