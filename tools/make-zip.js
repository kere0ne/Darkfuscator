#!/usr/bin/env node
/*
 * Packages the whole project into one distributable zip:
 *
 *   node tools/make-zip.js [output.zip]
 *
 * The archive contains the runnable site (site/), the single-file build, the
 * test suite, the tools and the README — everything except node_modules and
 * other scratch directories. Entries are stored under a darkfuscator/ folder so
 * the archive extracts cleanly.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'darkfuscator.zip'));

const SKIP_DIRS = new Set(['node_modules', 'domtest', '.git', '__pycache__', 'out', 'dist', '.arena', '.gh-pages-work']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db', 'package.json', 'package-lock.json']);
const SKIP_EXT = new Set(['.zip']);
const ROOT_PREFIX = 'darkfuscator/';

function walk(rel, out) {
  const abs = path.join(ROOT, rel);
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs).sort()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(rel ? rel + '/' + name : name, out);
    }
    if (!rel || !fs.readdirSync(abs).length) return;
  } else if (!SKIP_FILES.has(path.basename(abs)) && !SKIP_EXT.has(path.extname(abs))) {
    out.push(rel);
  }
}

// 1. the single-file build has to be current before it goes in the archive
const build = require('./build-standalone.js');
if (build && build.build) build.build();

const entries = [];
walk('', entries);

// keep the executable bit (tools/luau has to run straight after unzipping)
let manifest = entries.map(rel => {
  const abs = path.join(ROOT, rel);
  let mode = null;
  try { mode = fs.statSync(abs).mode & 0o777; } catch (e) { /* ignore */ }
  return [abs, ROOT_PREFIX + rel, mode];
});
// the archive root gets the self-contained build as index.html, so opening the
// extracted folder always lands on a working page — no relative js/*.js that a
// half-extracted archive would leave behind
manifest = manifest.filter(([, arc]) => arc !== ROOT_PREFIX + 'index.html');
manifest.push([build.OUT, ROOT_PREFIX + 'index.html', 0o644]);

const manifestPath = path.join(os.tmpdir(), 'darkf-zip-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify({ out: OUT, files: manifest }));

if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
execFileSync('python3', ['-c', `
import json, os, stat, zipfile, sys
m = json.load(open(sys.argv[1]))
written = 0
with zipfile.ZipFile(m['out'], 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for src, arc, mode in m['files']:
        if not os.path.isfile(src):
            continue
        info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))
        if mode is not None:
            info.external_attr = (mode & 0o777) << 16
            info.create_system = 3          # unix: the mode above is meaningful
        with open(src, 'rb') as fh:
            z.writestr(info, fh.read(), zipfile.ZIP_DEFLATED, 9)
        written += 1
print(written, 'entries')
`, manifestPath], { stdio: 'inherit' });

const size = fs.statSync(OUT).size;
console.log('wrote ' + OUT + '\n  ' + entries.length + ' items, ' + (size / 1024).toFixed(0) + ' KB');
