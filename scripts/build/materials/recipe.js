/* The material recipe, run inside the builder page (canvas.html).
   From one wallpaper it renders the blurred fields behind plates and sheets,
   a small panel preview and the darker "soft" glass under the dock. */
(function () {
  'use strict';

  var W = 1920,
    H = 1080,
    MARGIN = 96;
  /* Blurred fields: [name, blur px, saturation, JPEG quality]. */
  var FIELDS = [
    ['field-blur', 28, 0.92, 0.82],
    ['field-frost', 42, 0.92, 0.82],
    ['field-clear', 2, 1.06, 0.86]
  ];
  /* Highlights above this linear luminance are compressed so text on glass stays legible. */
  var KNEE = 0.82,
    KNEE_SLOPE = 0.4;
  /* The dock band, used to tint the soft glass. */
  var DOCK_MEAN = { x0: 96, x1: 1824, y0: 676, y1: 908 };
  var DOCK_SAMPLE = { x0: 112, x1: 1808, y0: 720, y1: 908, step: 4 };

  function surface(w, h) {
    var c = document.createElement('canvas');
    c.width = w || W;
    c.height = h || H;
    return c;
  }

  function jpeg(canvas, quality) {
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  }

  var toLinear = [];
  for (var v = 0; v < 256; v++) {
    var s = v / 255;
    toLinear.push(s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
  }
  function toSRGB(l) {
    return 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);
  }

  /* The photo scaled to cover the stage, centred. */
  function cover(img) {
    var out = surface(),
      k = Math.max(W / img.width, H / img.height);
    out
      .getContext('2d')
      .drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
    return out;
  }

  /* The photo surrounded by mirrored copies, so blur near the edges has real pixels to sample. */
  function mirrored(photo) {
    var out = surface(W + 2 * MARGIN, H + 2 * MARGIN),
      g = out.getContext('2d');
    for (var row = -1; row <= 1; row++) {
      for (var col = -1; col <= 1; col++) {
        g.save();
        g.translate(MARGIN + (col === 1 ? 2 * W : 0), MARGIN + (row === 1 ? 2 * H : 0));
        g.scale(col ? -1 : 1, row ? -1 : 1);
        g.drawImage(photo, 0, 0);
        g.restore();
      }
    }
    return out;
  }

  function compressHighlights(canvas) {
    var g = canvas.getContext('2d'),
      img = g.getImageData(0, 0, W, H),
      px = img.data;
    for (var i = 0; i < px.length; i += 4) {
      var r = toLinear[px[i]],
        gr = toLinear[px[i + 1]],
        b = toLinear[px[i + 2]];
      var lum = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      if (lum > KNEE) {
        var k = (KNEE + KNEE_SLOPE * (lum - KNEE)) / lum;
        px[i] = toSRGB(r * k);
        px[i + 1] = toSRGB(gr * k);
        px[i + 2] = toSRGB(b * k);
      }
      px[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  function field(padded, blur, saturation, keepHighlights) {
    var blurred = surface(W + 2 * MARGIN, H + 2 * MARGIN),
      bg = blurred.getContext('2d');
    bg.filter = 'blur(' + blur + 'px) saturate(' + saturation + ')';
    bg.drawImage(padded, 0, 0);
    var out = surface();
    out.getContext('2d').drawImage(blurred, MARGIN, MARGIN, W, H, 0, 0, W, H);
    if (!keepHighlights) compressHighlights(out);
    return out;
  }

  /* Soft glass: the photo under the Home scrim, blurred, pulled 35% towards the dock
     band's average colour, then darkened. The darkening follows the band's bright end
     (95th percentile luma) unless a reviewed value is supplied. */
  function softGlass(photo, reviewedTint) {
    var base = surface(),
      bg = base.getContext('2d');
    bg.drawImage(photo, 0, 0);
    var scrim = bg.createLinearGradient(0, 560, 0, H);
    scrim.addColorStop(0, 'rgba(4,10,12,0)');
    scrim.addColorStop(0.7, 'rgba(4,10,12,.42)');
    scrim.addColorStop(1, 'rgba(4,10,12,.52)');
    bg.fillStyle = scrim;
    bg.fillRect(0, 560, W, 520);

    var out = surface(),
      g = out.getContext('2d');
    g.filter = 'blur(14px) saturate(1.12)';
    g.drawImage(base, 0, 0);
    g.filter = 'none';
    var img = g.getImageData(0, 0, W, H),
      px = img.data;

    var sum = [0, 0, 0],
      n = 0,
      x,
      y,
      i,
      c;
    for (y = DOCK_MEAN.y0; y < DOCK_MEAN.y1; y++) {
      for (x = DOCK_MEAN.x0; x < DOCK_MEAN.x1; x++) {
        i = (y * W + x) * 4;
        for (c = 0; c < 3; c++) sum[c] += px[i + c];
        n++;
      }
    }
    var mean = sum.map(function (t) {
      return t / n;
    });
    for (i = 0; i < px.length; i += 4) {
      for (c = 0; c < 3; c++) px[i + c] = px[i + c] * 0.65 + mean[c] * 0.35;
      px[i + 3] = 255;
    }

    var lumas = [];
    for (y = DOCK_SAMPLE.y0; y < DOCK_SAMPLE.y1; y += DOCK_SAMPLE.step) {
      for (x = DOCK_SAMPLE.x0; x < DOCK_SAMPLE.x1; x += DOCK_SAMPLE.step) {
        i = (y * W + x) * 4;
        lumas.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
      }
    }
    lumas.sort(function (a, b) {
      return a - b;
    });
    var bright = lumas[Math.floor(lumas.length * 0.95)];
    var tint =
      reviewedTint == null ? Math.max(0.28, Math.min(0.6, (bright - 94) / (bright - 8.87))) : reviewedTint;

    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(4,10,12,' + tint + ')';
    g.fillRect(0, 0, W, H);
    return { canvas: out, tint: tint };
  }

  /* Returns { files: {suffix: base64 JPEG}, tint }. */
  window.ZenoMaterialRecipe = async function (wallpaperURL, reviewedTint) {
    var img = new Image();
    img.src = wallpaperURL;
    await img.decode();
    var photo = cover(img),
      padded = mirrored(photo),
      files = {},
      frost = null;
    FIELDS.forEach(function (f) {
      var out = field(padded, f[1], f[2], f[0] === 'field-clear');
      files[f[0]] = jpeg(out, f[3]);
      if (f[0] === 'field-frost') frost = out;
    });
    var panel = surface(320, 180);
    panel.getContext('2d').drawImage(frost, 0, 0, 320, 180);
    files.panel = jpeg(panel, 0.85);
    var soft = softGlass(photo, reviewedTint);
    files['glass-soft'] = jpeg(soft.canvas, 0.94);
    return { files: files, tint: soft.tint };
  };
})();
