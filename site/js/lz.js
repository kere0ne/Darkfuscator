/*!
 * lz.js — the Darkfuscator compression module.
 *
 * A dictionary compressor (LZSS) over the serialized bytecode stream, applied
 * at build time before encryption (encrypted bytes are incompressible) and
 * undone inside the generated VM before the integrity checksums run, so the
 * checksums still cover the full plaintext stream.
 *
 * Token stream, 8 tokens per flag byte (LSB first):
 *   flag bit 1 -> literal byte
 *   flag bit 0 -> match: b1 = (dist-1) & 0xFF, b2 = ((dist-1)>>8)<<4 | (len-3)
 * Window 4096 bytes, match length 3..18. The stream starts with a plain
 * varint holding the decompressed length, so the Lua decoder knows when to
 * stop without an end marker.
 *
 * compress() returns null when the packed stream is not smaller than the
 * input; callers fall back to the raw bytes.
 *
 * Browser: window.DarkfuscatorLZ   Node: require('./lz.js')
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DarkfuscatorLZ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WINDOW = 4096, MIN_MATCH = 3, MAX_MATCH = 18, CHAIN = 64;

  function writeVar(out, v) {
    while (v >= 128) { out.push((v % 128) | 128); v = Math.floor(v / 128); }
    out.push(v);
  }

  function compress(bytes) {
    var n = bytes.length;
    if (n < 16) return null;
    var out = [];
    writeVar(out, n);
    var head = Object.create(null);   // 3-byte key -> most recent position
    var prev = [];                    // position -> previous position, same key
    var pos = 0, flagPos = -1, flagBits = 8;

    while (pos < n) {
      if (flagBits === 8) { flagPos = out.length; out.push(0); flagBits = 0; }

      var bestLen = 0, bestDist = 0;
      if (pos + MIN_MATCH <= n) {
        var key = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16);
        var cand = (head[key] !== undefined) ? head[key] : -1;
        var floor = pos - WINDOW;
        var maxLen = Math.min(MAX_MATCH, n - pos);
        var tries = CHAIN;
        while (cand >= 0 && cand >= floor && tries-- > 0) {
          var l = 0;
          while (l < maxLen && bytes[cand + l] === bytes[pos + l]) l++;
          if (l > bestLen) {
            bestLen = l; bestDist = pos - cand;
            if (bestLen >= maxLen) break;
          }
          cand = (prev[cand] !== undefined) ? prev[cand] : -1;
        }
      }

      var end;
      if (bestLen >= MIN_MATCH) {
        var d1 = bestDist - 1;
        out.push(d1 & 255);
        out.push(((d1 >> 8) << 4) | (bestLen - 3));
        end = pos + bestLen;
      } else {
        out.push(bytes[pos]);
        out[flagPos] |= (1 << flagBits);
        end = pos + 1;
      }
      flagBits++;

      // chain-insert every position the token consumed
      for (var ip = pos; ip < end && ip + MIN_MATCH <= n; ip++) {
        var k2 = bytes[ip] | (bytes[ip + 1] << 8) | (bytes[ip + 2] << 16);
        prev[ip] = (head[k2] !== undefined) ? head[k2] : -1;
        head[k2] = ip;
      }
      pos = end;
    }

    if (out.length >= n) return null;
    return out;
  }

  // Lua-side decompressor, emitted into every compressed build. All variable
  // names are the emitter's generated, collision-checked names.
  // v.src / v.count are the decoder's byte table and byte-count locals and are
  // reassigned in place; the rest are fresh locals for this block.
  function luaSource(v) {
    return [
      // plaintext stream is LZSS-compressed: undo it before the checksums
      'local ' + v.p + '=1',
      'local ' + v.v + ',' + v.sh + '=0,1',
      'while true do local ' + v.b1 + '=' + v.src + '[' + v.p + ']; ' + v.p + '=' + v.p + '+1; ' +
        v.v + '=' + v.v + '+(' + v.b1 + '%128)*' + v.sh + '; if ' + v.b1 + '<128 then break end; ' +
        v.sh + '=' + v.sh + '*128 end',
      'local ' + v.out + '={} local ' + v.oc + '=0 local ' + v.fl + '=0 local ' + v.fb + '=0',
      'while ' + v.oc + '<' + v.v + ' do',
      'if ' + v.fb + '==0 then ' + v.fl + '=' + v.src + '[' + v.p + ']; ' + v.p + '=' + v.p + '+1; ' + v.fb + '=8 end',
      'local ' + v.bt + '=' + v.fl + '%2; ' + v.fl + '=(' + v.fl + '-' + v.bt + ')/2; ' + v.fb + '=' + v.fb + '-1',
      'if ' + v.bt + '==1 then ' + v.oc + '=' + v.oc + '+1; ' + v.out + '[' + v.oc + ']=' + v.src + '[' + v.p + ']; ' +
        v.p + '=' + v.p + '+1 else',
      'local ' + v.b1 + '=' + v.src + '[' + v.p + ']; local ' + v.b2 + '=' + v.src + '[' + v.p + '+1]; ' + v.p + '=' + v.p + '+2',
      'local ' + v.dist + '=math.floor(' + v.b2 + '/16)*256+' + v.b1 + '+1',
      'local ' + v.ml + '=math.floor(' + v.b2 + ' % 16)+3',
      'for ' + v.k + '=1,' + v.ml + ' do ' + v.oc + '=' + v.oc + '+1; ' + v.out + '[' + v.oc + ']=' + v.out + '[' + v.oc + '-' + v.dist + '] end',
      'end end',
      v.src + '=' + v.out + '; ' + v.count + '=' + v.v
    ];
  }

  return { compress: compress, luaSource: luaSource, WINDOW: WINDOW, MIN_MATCH: MIN_MATCH, MAX_MATCH: MAX_MATCH };
});
