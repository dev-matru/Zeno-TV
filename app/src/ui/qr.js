/* A small QR code encoder for short links (byte mode, error correction M,
 * versions 1 to 10, so up to 213 bytes). It follows ISO/IEC 18004:
 * Reed-Solomon blocks, interleaving, the eight masks and the format and
 * version information.
 *
 * ZenoQR.matrix(text) -> rows of booleans (true = dark)
 * ZenoQR.svg(text)    -> an SVG string with a four-module quiet zone
 */
(function (root) {
  'use strict';

  var ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  var BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  var MAX_VERSION = 10;

  function rawModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var align = Math.floor(ver / 7) + 2;
      result -= (25 * align - 10) * align - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(ver) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];
  }

  function alignment(ver) {
    if (ver === 1) return [];
    var count = Math.floor(ver / 7) + 2,
      size = ver * 4 + 17,
      step = Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2,
      result = [6];
    for (var pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  /* ---- Reed-Solomon over GF(256), polynomial 0x11D ---- */

  function mul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function divisor(degree) {
    var result = [],
      r = 1,
      i,
      j;
    for (i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = mul(result[j], r);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      r = mul(r, 2);
    }
    return result;
  }

  function remainder(data, div) {
    var result = div.map(function () {
      return 0;
    });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      div.forEach(function (coef, i) {
        result[i] ^= mul(coef, factor);
      });
    });
    return result;
  }

  /* ---- Data ---- */

  function utf8(text) {
    var s = unescape(encodeURIComponent(text)),
      out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function codewords(bytes, ver) {
    var bits = [],
      capacity = dataCodewords(ver) * 8;
    function put(value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    put(4, 4); // byte mode
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) {
      put(b, 8);
    });
    put(0, Math.min(4, capacity - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (var pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    return interleave(data, ver);
  }

  function interleave(data, ver) {
    var count = BLOCKS[ver],
      eccLen = ECC_PER_BLOCK[ver],
      raw = Math.floor(rawModules(ver) / 8),
      shortCount = count - (raw % count),
      shortLen = Math.floor(raw / count),
      div = divisor(eccLen),
      blocks = [],
      i,
      k;
    for (i = 0, k = 0; i < count; i++) {
      var block = data.slice(k, k + shortLen - eccLen + (i < shortCount ? 0 : 1));
      k += block.length;
      var ecc = remainder(block, div);
      if (i < shortCount) block.push(0);
      blocks.push(block.concat(ecc));
    }
    var result = [];
    for (i = 0; i < blocks[0].length; i++)
      for (k = 0; k < blocks.length; k++)
        if (i !== shortLen - eccLen || k >= shortCount) result.push(blocks[k][i]);
    return result;
  }

  /* ---- Matrix ---- */

  function Grid(ver) {
    var size = ver * 4 + 17,
      g = { size: size, dark: [], fixed: [] };
    for (var y = 0; y < size; y++) {
      g.dark.push([]);
      g.fixed.push([]);
      for (var x = 0; x < size; x++) {
        g.dark[y].push(false);
        g.fixed[y].push(false);
      }
    }
    return g;
  }

  function set(g, x, y, dark) {
    g.dark[y][x] = dark;
    g.fixed[y][x] = true;
  }

  function finder(g, cx, cy) {
    for (var dy = -4; dy <= 4; dy++)
      for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)),
          x = cx + dx,
          y = cy + dy;
        if (x >= 0 && x < g.size && y >= 0 && y < g.size) set(g, x, y, d !== 2 && d !== 4);
      }
  }

  function functionPatterns(g, ver) {
    var size = g.size,
      i;
    for (i = 0; i < size; i++) {
      set(g, 6, i, i % 2 === 0);
      set(g, i, 6, i % 2 === 0);
    }
    finder(g, 3, 3);
    finder(g, size - 4, 3);
    finder(g, 3, size - 4);
    var pos = alignment(ver),
      last = pos.length - 1;
    pos.forEach(function (x, a) {
      pos.forEach(function (y, b) {
        if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) return;
        for (var dy = -2; dy <= 2; dy++)
          for (var dx = -2; dx <= 2; dx++) set(g, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    format(g, 0);
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      var bits = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = ((bits >>> i) & 1) === 1,
          a = size - 11 + (i % 3),
          b = Math.floor(i / 3);
        set(g, a, b, bit);
        set(g, b, a, bit);
      }
    }
  }

  /* Format information for level M (bits 00) and `mask`. */
  function format(g, mask) {
    var data = mask,
      rem = data,
      i;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412,
      size = g.size;
    function bit(n) {
      return ((bits >>> n) & 1) === 1;
    }
    for (i = 0; i <= 5; i++) set(g, 8, i, bit(i));
    set(g, 8, 7, bit(6));
    set(g, 8, 8, bit(7));
    set(g, 7, 8, bit(8));
    for (i = 9; i < 15; i++) set(g, 14 - i, 8, bit(i));
    for (i = 0; i < 8; i++) set(g, size - 1 - i, 8, bit(i));
    for (i = 8; i < 15; i++) set(g, 8, size - 15 + i, bit(i));
    set(g, 8, size - 8, true);
  }

  function place(g, data) {
    var size = g.size,
      i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++)
        for (var j = 0; j < 2; j++) {
          var x = right - j,
            up = ((right + 1) & 2) === 0,
            y = up ? size - 1 - vert : vert;
          if (!g.fixed[y][x] && i < data.length * 8) {
            g.dark[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
    }
  }

  function masked(mask, x, y) {
    switch (mask) {
      case 0:
        return (x + y) % 2 === 0;
      case 1:
        return y % 2 === 0;
      case 2:
        return x % 3 === 0;
      case 3:
        return (x + y) % 3 === 0;
      case 4:
        return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5:
        return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6:
        return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default:
        return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  }

  function applyMask(g, mask) {
    for (var y = 0; y < g.size; y++)
      for (var x = 0; x < g.size; x++) if (!g.fixed[y][x] && masked(mask, x, y)) g.dark[y][x] = !g.dark[y][x];
  }

  /* Penalty rules 1, 2, 3 and 4 of the standard. */
  function penalty(g) {
    var size = g.size,
      score = 0,
      dark = 0,
      x,
      y;
    function runs(get) {
      for (var a = 0; a < size; a++) {
        var run = 1,
          line = [];
        for (var b = 0; b < size; b++) line.push(get(a, b));
        for (b = 1; b <= size; b++) {
          if (b < size && line[b] === line[b - 1]) run++;
          else {
            if (run >= 5) score += run - 2;
            run = 1;
          }
        }
        var s = line
          .map(function (v) {
            return v ? '1' : '0';
          })
          .join('');
        var pattern = /(?=(00001011101|10111010000))/g;
        while (pattern.exec(s)) {
          score += 40;
          pattern.lastIndex++;
        }
      }
    }
    runs(function (a, b) {
      return g.dark[a][b];
    });
    runs(function (a, b) {
      return g.dark[b][a];
    });
    for (y = 0; y < size - 1; y++)
      for (x = 0; x < size - 1; x++) {
        var c = g.dark[y][x];
        if (c === g.dark[y][x + 1] && c === g.dark[y + 1][x] && c === g.dark[y + 1][x + 1]) score += 3;
      }
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (g.dark[y][x]) dark++;
    var total = size * size;
    score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return score;
  }

  function matrix(text) {
    var bytes = utf8(String(text)),
      ver = 1;
    while (ver <= MAX_VERSION && bytes.length + (ver < 10 ? 2 : 3) > dataCodewords(ver)) ver++;
    if (ver > MAX_VERSION) throw Error('Text too long for a QR code');
    var data = codewords(bytes, ver),
      best = null,
      bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var g = Grid(ver);
      functionPatterns(g, ver);
      place(g, data);
      applyMask(g, mask);
      format(g, mask);
      var score = penalty(g);
      if (score < bestScore) {
        best = g;
        bestScore = score;
      }
    }
    return best.dark;
  }

  function svg(text) {
    var rows = matrix(text),
      size = rows.length + 8,
      path = '';
    rows.forEach(function (row, y) {
      row.forEach(function (dark, x) {
        if (dark) path += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z';
      });
    });
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      size +
      ' ' +
      size +
      '" shape-rendering="crispEdges"><rect width="' +
      size +
      '" height="' +
      size +
      '" fill="#fff"/><path fill="#000" d="' +
      path +
      '"/></svg>'
    );
  }

  var api = { matrix: matrix, svg: svg };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZenoQR = api;
})(this);
