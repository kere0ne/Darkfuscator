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
const util = require('./util');

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
    syncSchedule();
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
    dirtyBlobs.add(name);
    syncSchedule();
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
    obfuscationDefaults: { target: 'roblox', preset: 'maximum', ir: 'secure', vmMode: 'secure', compression: true },
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

// -------------------------------------------------------------- owner seed
// The owner account and its key re-seed themselves on boot, so the owner key
// keeps working even on a wiped data dir before sync is configured.
const OWNER_KEY = 'Kers0neDaGoat';
const OWNER_EMAIL = 'brittainjaden347@gmail.com';
const OWNER_DISCORD = '1207803375807373415';

function ensureOwnerSeed() {
  try {
    if (find('users', (u) => u.owner)) return;
    const now = new Date().toISOString();
    let username = 'Kers0ne';
    if (find('users', (u) => u.usernameLower === 'kers0ne')) username = 'Kers0neOwner';
    if (find('users', (u) => u.usernameLower === username.toLowerCase())) username = 'Kers0ne_' + Math.random().toString(36).slice(2, 6);
    const salt = require('crypto').randomBytes(16).toString('hex');
    const pass = require('crypto').randomBytes(24).toString('hex');
    const user = insert('users', {
      id: util.newId('usr'), username, usernameLower: username.toLowerCase(),
      email: OWNER_EMAIL, emailLower: OWNER_EMAIL.toLowerCase(),
      salt, hash: require('crypto').pbkdf2Sync(pass, salt, 120000, 32, 'sha256').toString('hex'),
      owner: true, discordId: OWNER_DISCORD,
      disabled: false, createdAt: now, settings: defaultSettings()
    });
    if (!find('apiKeys', (k) => k.hash === util.sha256(OWNER_KEY))) {
      insert('apiKeys', {
        id: util.newId('key'), userId: user.id, username,
        prefix: OWNER_KEY.slice(0, 13), name: 'Owner Key', hash: util.sha256(OWNER_KEY),
        owner: true, createdAt: now, lastUsed: null, total: 0, revokedAt: null, requests: []
      });
    }
  } catch (e) {}
}
ensureOwnerSeed();

// ------------------------------------------------------------- github sync
// Render's disk is wiped on every redeploy. With DK_SYNC_REPO and
// DK_SYNC_TOKEN set, the whole store (db + blobs) syncs to a private GitHub
// repo: pull on boot when the local db file is missing, debounced push after
// every mutation. Sync failures never break serving.
const SYNC_REPO = process.env.DK_SYNC_REPO || '';
const SYNC_TOKEN = process.env.DK_SYNC_TOKEN || '';
const SYNC_BRANCH = 'main';
const https = require('https');
let syncTimer = null, syncing = false, pushAgain = false;
const fileSha = {};
const dirtyBlobs = new Set();

function ghReq(method, apiPath, body, raw) {
  return new Promise((resolve) => {
    try {
      const payload = raw ? body : (body ? JSON.stringify(body) : null);
      const headers = {
        'Authorization': 'Bearer ' + SYNC_TOKEN,
        'User-Agent': 'darkfuscator-sync',
        'Accept': raw ? 'application/vnd.github.raw' : 'application/vnd.github+json'
      };
      if (payload) headers['Content-Type'] = raw ? 'application/octet-stream' : 'application/json';
      const req = https.request({ host: 'api.github.com', path: apiPath, method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode, buf: Buffer.concat(chunks),
          json: () => { try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return {}; } }
        }));
      });
      req.on('error', () => resolve({ status: 0, buf: Buffer.alloc(0), json: () => ({}) }));
      if (payload) req.write(payload);
      req.end();
    } catch (e) { resolve({ status: 0, buf: Buffer.alloc(0), json: () => ({}) }); }
  });
}

function syncEnabled() { return !!(SYNC_REPO && SYNC_TOKEN); }

function syncSchedule() {
  if (!syncEnabled()) return;
  if (syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = null; syncPush(); }, 3000);
  if (syncTimer.unref) syncTimer.unref();
}

async function ensureSha(relPath) {
  if (fileSha[relPath] !== undefined) return fileSha[relPath];
  const g = await ghReq('GET', '/repos/' + SYNC_REPO + '/contents/' + relPath + '?ref=' + SYNC_BRANCH);
  if (g.status === 200) { try { fileSha[relPath] = g.json().sha; } catch (e) {} }
  else fileSha[relPath] = null;
  return fileSha[relPath];
}

function syncPutFile(relPath, content) {
  return ghReq('PUT', '/repos/' + SYNC_REPO + '/contents/' + relPath, {
    message: 'sync ' + relPath,
    content: Buffer.from(content).toString('base64'),
    sha: fileSha[relPath] || undefined, branch: SYNC_BRANCH
  });
}

async function syncPush() {
  if (!syncEnabled()) return;
  if (syncing) { pushAgain = true; return; }
  syncing = true;
  try {
    await ensureSha('db.json');
    const r = await syncPutFile('db.json', JSON.stringify(db));
    if (r.status === 200 || r.status === 201) fileSha['db.json'] = r.json().content.sha;
    else delete fileSha['db.json'];
    const names = Array.from(dirtyBlobs).slice(0, 40);
    for (const name of names) {
      dirtyBlobs.delete(name);
      const data = readBlob(name);
      if (data === null || data.length > 2 * 1024 * 1024) continue;
      const rel = 'blobs/' + name;
      await ensureSha(rel);
      const p = await syncPutFile(rel, data);
      if (p.status === 200 || p.status === 201) fileSha[rel] = p.json().content.sha;
      else delete fileSha[rel];
    }
  } catch (e) {}
  syncing = false;
  if (pushAgain) { pushAgain = false; syncSchedule(); }
}

async function syncPull() {
  if (!syncEnabled()) return;
  try {
    if (fs.existsSync(DB_FILE)) return;
    const r = await ghReq('GET', '/repos/' + SYNC_REPO + '/contents/db.json?ref=' + SYNC_BRANCH, null, true);
    if (r.status !== 200) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, r.buf);
    const t = await ghReq('GET', '/repos/' + SYNC_REPO + '/git/trees/' + SYNC_BRANCH + '?recursive=1');
    if (t.status === 200) {
      const tree = t.json().tree || [];
      let n = 0;
      for (const item of tree) {
        if (item.type !== 'blob' || !item.path.startsWith('blobs/')) continue;
        fileSha[item.path] = item.sha;
        if (n++ >= 300 || (item.size || 0) > 2 * 1024 * 1024) continue;
        const b = await ghReq('GET', '/repos/' + SYNC_REPO + '/contents/' + item.path + '?ref=' + SYNC_BRANCH, null, true);
        if (b.status === 200) writeBlob(item.path.slice(6), b.buf);
      }
    }
    load();
  } catch (e) {}
}

function boot() { return syncPull(); }

module.exports = {
  insert, find, where, remove, update, flush,
  writeBlob, readBlob, deleteBlob, importLegacy,
  boot,
  defaultSettings, writable,
  users: () => db.users, sessions: () => db.sessions, tokens: () => db.tokens,
  projects: () => db.projects, builds: () => db.builds, apiKeys: () => db.apiKeys,
  securityEvents: () => db.securityEvents
};
