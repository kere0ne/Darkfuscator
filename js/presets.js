/*!
 * presets.js — named build profiles for Darkfuscator.
 *
 * Each preset is a partial option set merged over the engine defaults, then
 * the config file, then CLI flags (last one wins). See bin/luau-obfuscator.js.
 *
 * Browser: window.DarkfuscatorPresets   Node: require('./presets.js')
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DarkfuscatorPresets = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRESETS = {
    // small and fast: minimal junk, fast anti-tamper, compact names
    lightweight: {
      junk: 0, guard: 1, envChecks: 1, antiTamper: 0,
      nameStyle: 'short', minify: true, compress: true
    },
    // the default: full VM pipeline with balanced protection
    balanced: {
      junk: 1, guard: 1, envChecks: 2, antiTamper: 1,
      nameStyle: 'random', minify: true, compress: true
    },
    // everything on: monstrous junk (~100k statements), strong audits,
    // full anti-tamper, confusing name style
    maximum: {
      junk: 3, guard: 2, envChecks: 2, antiTamper: 2,
      nameStyle: 'confuse', minify: true, compress: true
    }
  };

  return { PRESETS: PRESETS, names: Object.keys(PRESETS) };
});
