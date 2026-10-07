#!/usr/bin/env node
/*
 * Build one self-contained local-engine page. The result includes the real
 * parser, compiler, optimizer, VM emitter, and local workspace wiring, so it
 * works from disk without a service, account, history, or API-key simulation.
 *
 *   node tools/build-standalone.js [output.html]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');
const DEFAULT_OUT = path.join(__dirname, '..', 'darkfuscator-standalone.html');
const OUT = require.main === module && process.argv[2]
  ? path.resolve(process.argv[2]) : DEFAULT_OUT;
const SCRIPTS = [
  'js/luau-lexer.js', 'js/luau-parser.js', 'js/pipeline.js', 'js/vm-compile.js',
  'js/vm-emit.js', 'js/obfuscate.js', 'js/offline.js'
];

function inlineSafe(source) {
  // Avoid prematurely ending the single generated script/style element.
  return source.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

function build() {
  let html = fs.readFileSync(path.join(SITE, 'offline.html'), 'utf8');
  const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');

  // A standalone build cannot navigate to the hosted account/docs routes. Keep
  // the page honest and local instead of leaving broken platform navigation.
  html = html.replace(/<img src="\/assets\/logo\.png" alt="">/, '<span aria-hidden="true">DF</span>');
  html = html.replace(/<nav class="land-nav">[\s\S]*?<\/nav>/,
    '<span class="dim">Self-contained local engine</span>');
  html = html.replace(/<footer class="land-foot">[\s\S]*?<\/footer>/,
    '<footer class="land-foot"><p class="dim">This file is local-only: it does not provide accounts, history, API keys, or server storage.</p></footer>');
  html = html.replace(/<link rel="stylesheet" href="\/styles\.css">/,
    '<style>\n' + inlineSafe(css) + '\n</style>');

  let scripts = '';
  for (const rel of SCRIPTS) {
    scripts += '/* ===== ' + rel + ' ===== */\n' + inlineSafe(fs.readFileSync(path.join(SITE, rel), 'utf8')) + '\n';
  }
  html = html.replace(/<script src="\/?js\/[^"]+"><\/script>\s*/g, '');
  html = html.replace('</body>', '<script>\n' + scripts + '</script>\n</body>');

  fs.writeFileSync(OUT, html);
  console.log('wrote ' + OUT + ' (' + html.length.toLocaleString() + ' chars, self-contained)');
  return OUT;
}

module.exports = { build, OUT };
if (require.main === module) build();
