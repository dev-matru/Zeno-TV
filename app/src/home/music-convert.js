/* Shrinks uncompressed tracks sent from a phone (WAV, AIFF) to Ogg Opus, on the TV.
 *
 * The phone page is plain http on the home network, where browsers do not
 * offer audio encoders; the TV app runs from file:// and has WebCodecs with
 * Opus. The file is read from the service a few MB at a time, encoded at
 * 160 kbit/s (96 for mono), wrapped in Ogg pages and sent back, so a one-hour
 * WAV never sits decoded in memory.
 *
 * ZenoConvert.available()                  -> whether this browser can encode Opus
 * ZenoConvert.run(url, progress, done)     -> done(error, Blob of audio/ogg)
 * ZenoConvert.header(bytes), .samples(...), .ogg(...) are pure helpers for the checks.
 */
(function (root) {
  'use strict';

  var READ_BYTES = 4 * 1024 * 1024;
  var HEADER_BYTES = 1024 * 1024;

  /* ---- Reading WAV and AIFF ---- */

  function text(b, at, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += String.fromCharCode(b[at + i]);
    return s;
  }
  function u16(b, at, le) {
    return le ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1];
  }
  function u32(b, at, le) {
    return le
      ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 16777216
      : b[at] * 16777216 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);
  }
  /* The 80-bit float AIFF uses for its sample rate. */
  function extended(b, at) {
    var exponent = (((b[at] & 0x7f) << 8) | b[at + 1]) - 16383,
      mantissa = u32(b, at + 2, false) * 4294967296 + u32(b, at + 6, false);
    return Math.round(mantissa * Math.pow(2, exponent - 63));
  }

  /* Format and where the samples are: { sampleRate, channels, bits, float, little, start, length }. */
  function header(b, fileLength) {
    var f = { float: false, little: true },
      at = 12,
      riff = text(b, 0, 4) === 'RIFF' && text(b, 8, 4) === 'WAVE',
      aiff = text(b, 0, 4) === 'FORM' && /^AIF[FC]$/.test(text(b, 8, 4));
    if (!riff && !aiff) throw Error('Formato non convertibile.');
    f.little = riff;
    while (at + 8 <= b.length) {
      var id = text(b, at, 4),
        size = u32(b, at + 4, riff),
        body = at + 8;
      if (riff && id === 'fmt ') {
        var tag = u16(b, body, true);
        if (tag === 0xfffe) tag = u16(b, body + 24, true);
        if (tag !== 1 && tag !== 3) throw Error('WAV compresso: non convertibile.');
        f.float = tag === 3;
        f.channels = u16(b, body + 2, true);
        f.sampleRate = u32(b, body + 4, true);
        f.bits = u16(b, body + 14, true);
      } else if (aiff && id === 'COMM') {
        f.channels = u16(b, body, false);
        f.bits = u16(b, body + 6, false);
        f.sampleRate = extended(b, body + 8);
        if (text(b, 8, 4) === 'AIFC') {
          var kind = text(b, body + 18, 4);
          if (kind === 'sowt') f.little = true;
          else if (kind === 'fl32' || kind === 'FL32') f.float = true;
          else if (kind !== 'NONE') throw Error('AIFF compresso: non convertibile.');
        }
      } else if ((riff && id === 'data') || (aiff && id === 'SSND')) {
        f.start = aiff ? body + 8 + u32(b, body, false) : body;
        f.length = aiff ? size - 8 - u32(b, body, false) : size;
        if (fileLength && (!f.length || f.start + f.length > fileLength)) f.length = fileLength - f.start;
        break;
      }
      at = body + size + (size % 2);
    }
    if (!f.sampleRate || !f.channels || f.start === undefined) throw Error('File audio incompleto.');
    if ([8, 16, 24, 32, 64].indexOf(f.bits) < 0 || (f.float && f.bits < 32))
      throw Error('Formato dei campioni non supportato.');
    f.frameBytes = (f.channels * f.bits) / 8;
    f.length -= f.length % f.frameBytes;
    f.out = Math.min(2, f.channels);
    return f;
  }

  /* Whole frames in `b` as planar float32: one or two channels, extra ones dropped. */
  function samples(b, f) {
    var frames = Math.floor(b.length / f.frameBytes),
      out = new Float32Array(frames * f.out),
      view = new DataView(b.buffer, b.byteOffset, b.byteLength),
      step = f.bits / 8;
    for (var i = 0; i < frames; i++)
      for (var c = 0; c < f.out; c++) {
        var at = i * f.frameBytes + c * step,
          v;
        if (f.float) v = f.bits === 64 ? view.getFloat64(at, f.little) : view.getFloat32(at, f.little);
        else if (f.bits === 8) v = f.little ? (b[at] - 128) / 128 : view.getInt8(at) / 128;
        else if (f.bits === 16) v = view.getInt16(at, f.little) / 32768;
        else if (f.bits === 32) v = view.getInt32(at, f.little) / 2147483648;
        else {
          var x = f.little
            ? b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)
            : (b[at] << 16) | (b[at + 1] << 8) | b[at + 2];
          v = (x & 0x800000 ? x - 0x1000000 : x) / 8388608;
        }
        out[c * frames + i] = v;
      }
    return { frames: frames, data: out };
  }

  /* ---- Ogg pages (RFC 3533, RFC 7845) ---- */

  var CRC = (function () {
    var table = [];
    for (var i = 0; i < 256; i++) {
      var r = i << 24;
      for (var k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
      table.push(r >>> 0);
    }
    return table;
  })();

  function page(packets, granule, serial, sequence, flags) {
    var lacing = [],
      size = 0;
    packets.forEach(function (p) {
      for (var n = p.length; n >= 255; n -= 255) lacing.push(255);
      lacing.push(n);
      size += p.length;
    });
    var out = new Uint8Array(27 + lacing.length + size),
      view = new DataView(out.buffer);
    out.set([79, 103, 103, 83, 0, flags], 0);
    view.setUint32(6, granule % 4294967296, true);
    view.setUint32(10, Math.floor(granule / 4294967296), true);
    view.setUint32(14, serial, true);
    view.setUint32(18, sequence, true);
    out[26] = lacing.length;
    out.set(lacing, 27);
    var at = 27 + lacing.length;
    packets.forEach(function (p) {
      out.set(p, at);
      at += p.length;
    });
    var crc = 0;
    for (var i = 0; i < out.length; i++) crc = ((crc << 8) ^ CRC[((crc >>> 24) ^ out[i]) & 0xff]) >>> 0;
    view.setUint32(22, crc, true);
    return out;
  }

  function opusHead(channels, preskip, sampleRate) {
    var b = new Uint8Array(19),
      v = new DataView(b.buffer);
    b.set([79, 112, 117, 115, 72, 101, 97, 100, 1, channels], 0);
    v.setUint16(10, preskip, true);
    v.setUint32(12, sampleRate, true);
    return b;
  }

  function opusTags() {
    var vendor = 'Zeno TV',
      b = new Uint8Array(8 + 4 + vendor.length + 4),
      v = new DataView(b.buffer);
    b.set([79, 112, 117, 115, 84, 97, 103, 115], 0);
    v.setUint32(8, vendor.length, true);
    for (var i = 0; i < vendor.length; i++) b[12 + i] = vendor.charCodeAt(i);
    return b;
  }

  /* Opus packets -> an Ogg Opus file as a list of byte arrays. `packets` are
     { data, samples } with samples counted at 48 kHz; `total` trims the end. */
  function ogg(packets, channels, preskip, sampleRate, total48) {
    var serial = 0x5a454e4f,
      out = [
        page([opusHead(channels, preskip, sampleRate)], 0, serial, 0, 2),
        page([opusTags()], 0, serial, 1, 0)
      ],
      sequence = 2,
      granule = preskip,
      group = [],
      segments = 0;
    function flush(last) {
      out.push(
        page(group, last ? Math.min(granule, preskip + total48) : granule, serial, sequence++, last ? 4 : 0)
      );
      group = [];
      segments = 0;
    }
    packets.forEach(function (p, i) {
      var need = Math.floor(p.data.length / 255) + 1;
      if (segments + need > 255 || group.length >= 50) flush(false);
      group.push(p.data);
      segments += need;
      granule += p.samples;
      if (i === packets.length - 1) flush(true);
    });
    return out;
  }

  /* ---- Encoding ---- */

  function available() {
    return typeof root.AudioEncoder === 'function' && typeof root.AudioData === 'function';
  }

  function read(url, start, end, done) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.setRequestHeader('Range', 'bytes=' + start + '-' + end);
    xhr.onload = function () {
      if (xhr.status !== 206 && xhr.status !== 200) return done(Error('Lettura non riuscita.'));
      var total = +(String(xhr.getResponseHeader('Content-Range') || '').split('/')[1] || 0);
      done(null, new Uint8Array(xhr.response), total);
    };
    xhr.onerror = xhr.ontimeout = function () {
      done(Error('Il servizio del TV non risponde.'));
    };
    xhr.send();
  }

  function run(url, progress, done) {
    if (!available()) return done(Error('Questo TV non sa convertire l’audio.'));
    var finished = false;
    function finish(error, value) {
      if (finished) return;
      finished = true;
      done(error, value);
    }
    read(url, 0, HEADER_BYTES - 1, function (error, head, size) {
      if (error) return finish(error);
      var f, encoder;
      try {
        f = header(head, size || head.length);
      } catch (e) {
        return finish(e);
      }
      var packets = [],
        preskip = 312,
        frames = 0,
        position = f.start,
        end = f.start + f.length;
      try {
        encoder = new root.AudioEncoder({
          output: function (chunk, meta) {
            var d = meta && meta.decoderConfig && meta.decoderConfig.description;
            if (d) {
              var h = new Uint8Array(d.buffer || d, d.byteOffset || 0, d.byteLength);
              if (h.length >= 19 && text(h, 0, 8) === 'OpusHead') preskip = u16(h, 10, true);
            }
            var data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            packets.push({ data: data, samples: Math.round((chunk.duration || 20000) * 0.048) });
          },
          error: function (e) {
            finish(Error('Conversione non riuscita: ' + e.message));
          }
        });
        encoder.configure({
          codec: 'opus',
          sampleRate: f.sampleRate,
          numberOfChannels: f.out,
          bitrate: f.out > 1 ? 160000 : 96000
        });
      } catch (e) {
        return finish(Error('Conversione non disponibile: ' + e.message));
      }
      function step() {
        if (finished) return;
        if (encoder.encodeQueueSize > 8) return setTimeout(step, 20);
        if (position >= end) {
          encoder.flush().then(
            function () {
              encoder.close();
              var total48 = Math.round((frames * 48000) / f.sampleRate);
              finish(
                null,
                new Blob(ogg(packets, f.out, preskip, f.sampleRate, total48), { type: 'audio/ogg' })
              );
            },
            function (e) {
              finish(Error('Conversione non riuscita: ' + e.message));
            }
          );
          return;
        }
        var last = Math.min(end, position + READ_BYTES - (READ_BYTES % f.frameBytes)) - 1;
        read(url, position, last, function (error, bytes) {
          if (error) return finish(error);
          if (finished) return;
          var s = samples(bytes, f);
          if (!s.frames) return finish(Error('File audio incompleto.'));
          try {
            encoder.encode(
              new root.AudioData({
                format: 'f32-planar',
                sampleRate: f.sampleRate,
                numberOfFrames: s.frames,
                numberOfChannels: f.out,
                timestamp: Math.round((frames * 1e6) / f.sampleRate),
                data: s.data
              })
            );
          } catch (e) {
            return finish(Error('Conversione non riuscita: ' + e.message));
          }
          frames += s.frames;
          position += s.frames * f.frameBytes;
          progress(Math.min(99, Math.floor((100 * (position - f.start)) / f.length)));
          step();
        });
      }
      step();
    });
  }

  var api = { available: available, run: run, header: header, samples: samples, ogg: ogg };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZenoConvert = api;
})(this);
