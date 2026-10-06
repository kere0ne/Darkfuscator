#!/usr/bin/env node
/*
 * Builds a single self-contained HTML file (no external CSS/JS, examples
 * embedded) so Darkfuscator works straight from disk or in a sandboxed preview.
 *
 *   node tools/build-standalone.js [output.html]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'site');
const DEFAULT_OUT = path.join(__dirname, '..', 'darkfuscator-standalone.html');
// only honour argv when run directly — required by tools/make-zip.js, argv[2]
// belongs to *that* tool and must not redirect this one's output
const OUT = require.main === module && process.argv[2]
  ? path.resolve(process.argv[2]) : DEFAULT_OUT;

const SCRIPTS = ['js/luau-lexer.js', 'js/luau-parser.js', 'js/vm-compile.js',
  'js/vm-emit.js', 'js/obfuscate.js'];

function main() {
let html = fs.readFileSync(path.join(SITE, 'obfuscate.html'), 'utf8');
const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');

// the standalone build is one file: point the sidebar links at itself
html = html.replace(/href="obfuscate\.html"/g, 'href="#"')
           .replace(/href="index\.html"/g, 'href="#"');


// 1. inline the stylesheet
html = html.replace(/<link rel="stylesheet" href="styles\.css">/,
  '<style>\n' + css + '\n</style>');

// 2. inline the engine + app scripts
let js = '';
for (const rel of SCRIPTS.concat(['js/app.js'])) {
  // a literal </script (or <!--) inside the sources would end the tag early and
  // leave a blank page, so neutralise both
  const src = fs.readFileSync(path.join(SITE, rel), 'utf8')
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');
  js += '/* ===== ' + rel + ' ===== */\n' + src + '\n';
}

html = html.replace(/<script src="js\/[^"]+"><\/script>\s*/g, '');
html = html.replace('</body>', '<script>\n' + js + '</script>\n</body>');

fs.writeFileSync(OUT, html);
console.log('wrote ' + OUT + ' (' + html.length.toLocaleString() + ' chars, self-contained)');
return OUT;
}

module.exports = { build: main, OUT: OUT };

if (require.main === module) main();
