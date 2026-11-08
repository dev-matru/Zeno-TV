/* The Grid layout: apps and widgets placed freely on a plane.
 *
 * Positions are in card units, in steps of half a card: { x: 1.5, y: 2 }.
 * A full card is 1×1, a half card 0.5×1, a quarter card 0.5×0.5. Only widgets
 * can be half or quarter size. The plane is bounded at ±32 in both directions,
 * and the screen shows a window of columns × rows onto it (the "camera").
 *
 * The saved layout ("desktop") looks like:
 *   { v: 1, columns, rows, peeks, widgets: { clock: true, ... },
 *     positions: { id: {x, y} }, sizes: { widgetId: 'full' | 'half' | 'quarter' } }
 *
 * Every function here is pure: it takes a layout and returns a new one, so the
 * same code runs on the TV and in the checks.
 */
(function () {
  'use strict';

  var LIMIT = 32;
  var SIZES = ['full', 'half', 'quarter'];

  var WIDGETS = [
    { id: 'widget.clock', name: 'Orologio', widget: 'clock', mark: true },
    { id: 'widget.weather', name: 'Meteo', widget: 'weather', mark: true },
    { id: 'widget.player', name: 'Musica', widget: 'player', mark: true },
    { id: 'widget.sources', name: 'Sorgenti', widget: 'sources', mark: true },
    { id: 'widget.settings', name: 'Personalizza', widget: 'settings', mark: true }
  ];

  // Where widgets start on a new layout: along the top row.
  var WIDGET_START = {
    'widget.clock': { x: 0, y: 0 },
    'widget.weather': { x: 1, y: 0 },
    'widget.player': { x: 2, y: 0 },
    'widget.sources': { x: 3, y: 0 },
    'widget.settings': { x: 3.5, y: 0 }
  };

  // Screen geometry, in 1080p pixels.
  var SCREEN_WIDTH = 1920;
  var SCREEN_HEIGHT = 1080;
  var CONTENT_WIDTH = 1660;
  var GAP_X = 36;
  var HALF_GAP_Y = 24; // between the two halves of a card split vertically
  var CARD_WIDTH = 388; // card design size the scale is measured from
  var CARD_HEIGHT = 208;
  var CAPTION_SPACE = 128;

  function definition(id) {
    for (var i = 0; i < WIDGETS.length; i++) if (WIDGETS[i].id === id) return WIDGETS[i];
    return null;
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPosition(p) {
    return (
      p &&
      typeof p.x === 'number' &&
      typeof p.y === 'number' &&
      (p.x * 2) % 1 === 0 &&
      (p.y * 2) % 1 === 0 &&
      Math.abs(p.x) <= LIMIT &&
      Math.abs(p.y) <= LIMIT
    );
  }

  function step(key, distance) {
    return {
      x: key === 'left' ? -distance : key === 'right' ? distance : 0,
      y: key === 'up' ? -distance : key === 'down' ? distance : 0
    };
  }

  /* Ids of everything on the plane: enabled widgets first, then the home apps. */
  function ids(desktop, home) {
    return WIDGETS.filter(function (widget) {
      return desktop.widgets[widget.widget];
    })
      .map(function (widget) {
        return widget.id;
      })
      .concat(home);
  }

  function span(desktop, id) {
    var size = desktop.sizes && desktop.sizes[id];
    return { x: size === 'half' || size === 'quarter' ? 0.5 : 1, y: size === 'quarter' ? 0.5 : 1 };
  }

  function overlaps(a, aSpan, b, bSpan) {
    return a.x < b.x + bSpan.x && a.x + aSpan.x > b.x && a.y < b.y + bSpan.y && a.y + aSpan.y > b.y;
  }

  /* Whether id fits at p without covering anything else (except `ignore`). */
  function free(desktop, all, id, p, ignore) {
    var size = span(desktop, id);
    return !all.some(function (other) {
      var at = desktop.positions[other];
      return other !== id && other !== ignore && at && overlaps(p, size, at, span(desktop, other));
    });
  }

  function defaultWidgetOn(widget, weatherEnabled) {
    if (widget === 'player') return false;
    if (widget === 'weather') return weatherEnabled !== false;
    return true;
  }

  function defaultSize(widget) {
    return widget === 'sources' || widget === 'settings' ? 'half' : 'full';
  }

  /* The first free half-step cell, reading left to right, top to bottom. */
  function firstFreeCell(desktop, all, id) {
    var perRow = desktop.columns * 2;
    var slot = 0;
    var p;
    do {
      p = { x: (slot % perRow) / 2, y: Math.floor(slot / perRow) / 2 };
      slot++;
    } while (!free(desktop, all, id, p));
    return p;
  }

  /* A valid layout from whatever was saved, for the given home apps.
     Things already placed keep their place; new ones go to their usual spot or
     the first free cell. Turning a widget on never pushes apps around. */
  function normalise(saved, home, weatherEnabled) {
    saved = saved && typeof saved === 'object' ? saved : {};
    var savedPositions = saved.positions || {};
    var desktop = {
      v: 1,
      columns: [3, 4, 5].indexOf(saved.columns) >= 0 ? saved.columns : 4,
      rows: [2, 3].indexOf(saved.rows) >= 0 ? saved.rows : 3,
      peeks: saved.peeks !== false,
      widgets: {},
      positions: {},
      sizes: {}
    };

    WIDGETS.forEach(function (widget) {
      var on = saved.widgets && saved.widgets[widget.widget];
      desktop.widgets[widget.widget] =
        typeof on === 'boolean' ? on : defaultWidgetOn(widget.widget, weatherEnabled);
      var size = saved.sizes && saved.sizes[widget.id];
      desktop.sizes[widget.id] = SIZES.indexOf(size) >= 0 ? size : defaultSize(widget.widget);
    });

    var all = ids(desktop, home);

    // Hidden widgets remember where they were.
    WIDGETS.forEach(function (widget) {
      var p = savedPositions[widget.id];
      if (isPosition(p) && all.indexOf(widget.id) < 0) desktop.positions[widget.id] = { x: p.x, y: p.y };
    });

    // Then everything on screen that still fits where it was.
    all.forEach(function (id) {
      var p = savedPositions[id];
      if (isPosition(p) && free(desktop, all, id, p)) desktop.positions[id] = { x: p.x, y: p.y };
    });

    // Then the rest.
    all.forEach(function (id) {
      if (desktop.positions[id]) return;
      var index = home.indexOf(id);
      var p = copy(WIDGET_START[id] || { x: index % 4, y: 1 + Math.floor(index / 4) });
      if (!free(desktop, all, id, p)) p = firstFreeCell(desktop, all, id);
      desktop.positions[id] = p;
    });
    return desktop;
  }

  /* Where focus goes from id when pressing an arrow: the closest card in that
     direction, preferring cards in line over cards off to the side. */
  function neighbour(desktop, home, id, key) {
    var from = desktop.positions[id];
    var direction = step(key, 1);
    var best = null;
    var bestScore = Infinity;
    if (!from) return ids(desktop, home)[0];
    ids(desktop, home).forEach(function (other) {
      if (other === id) return;
      var to = desktop.positions[other];
      var ahead = direction.x ? (to.x - from.x) * direction.x : (to.y - from.y) * direction.y;
      var aside = direction.x ? Math.abs(to.y - from.y) : Math.abs(to.x - from.x);
      if (ahead <= 0) return;
      var score = ahead * 100 + aside * 160;
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    });
    return best || id;
  }

  /* Move a card one step. Widgets try half a step first. If the move lands on
     exactly one other card, the two swap places. */
  function move(desktop, home, id, key) {
    var all = ids(desktop, home);
    var steps = definition(id) ? [0.5, 1] : [1];
    for (var i = 0; i < steps.length; i++) {
      var next = copy(desktop);
      var from = next.positions[id];
      if (!from) return next;
      var delta = step(key, steps[i]);
      var to = { x: from.x + delta.x, y: from.y + delta.y };
      if (!isPosition(to)) continue;

      var covered = all.filter(function (other) {
        return other !== id && overlaps(to, span(next, id), next.positions[other], span(next, other));
      });
      if (covered.length > 1) continue;
      next.positions[id] = to;
      if (covered.length === 1) {
        var other = covered[0];
        next.positions[other] = { x: from.x, y: from.y };
        if (!free(next, all, other, next.positions[other]) || !free(next, all, id, to)) continue;
      }
      return next;
    }
    return copy(desktop);
  }

  /* Change a widget's size. If it no longer fits, it moves to the nearest free spot. */
  function resize(desktop, home, id, size) {
    if (!definition(id) || SIZES.indexOf(size) < 0) return copy(desktop);
    var next = copy(desktop);
    var all = ids(next, home);
    var origin = next.positions[id];
    next.sizes[id] = size;
    if (!origin || free(next, all, id, origin)) return next;

    // Search outwards in rings of half steps.
    for (var radius = 1; radius < 128; radius++) {
      for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
          var p = { x: origin.x + dx * 0.5, y: origin.y + dy * 0.5 };
          if (isPosition(p) && free(next, all, id, p)) {
            next.positions[id] = p;
            return next;
          }
        }
      }
    }
    return copy(desktop);
  }

  /* Pixel sizes of the grid for the current columns and rows. */
  function geometry(desktop) {
    var width = (CONTENT_WIDTH - (desktop.columns - 1) * GAP_X) / desktop.columns;
    var scale = width / CARD_WIDTH;
    var height = CARD_HEIGHT * scale;
    var pitchY = (SCREEN_HEIGHT + height - CAPTION_SPACE) / (desktop.rows + 1);
    return {
      width: width,
      height: height,
      scale: scale,
      pitchX: width + GAP_X,
      pitchY: pitchY,
      left: (SCREEN_WIDTH - CONTENT_WIDTH) / 2,
      top: (SCREEN_HEIGHT - height - (desktop.rows - 1) * pitchY) / 2
    };
  }

  /* Pixel offset of a grid position. A half step sits inside a full card, so it
     does not include the big gap between rows. The camera uses the same mapping,
     which keeps scrolling one continuous plane. */
  function point(desktop, p) {
    var g = geometry(desktop);
    var row = Math.floor(p.y);
    var column = Math.floor(p.x);
    return {
      x: column * g.pitchX + (p.x - column) * (g.width + GAP_X * g.scale),
      y: row * g.pitchY + (p.y - row) * (g.height + HALF_GAP_Y * g.scale)
    };
  }

  /* The top-left of the visible window, moved just enough to show id. */
  function camera(desktop, id, current) {
    var p = desktop.positions[id];
    var size = span(desktop, id);
    var view = { x: (current && current.x) || 0, y: (current && current.y) || 0 };
    if (!p) return view;
    if (p.x < view.x) view.x = p.x;
    if (p.x + size.x > view.x + desktop.columns) view.x = Math.ceil((p.x + size.x - desktop.columns) * 2) / 2;
    if (p.y < view.y) view.y = p.y;
    if (p.y + size.y > view.y + desktop.rows) view.y = Math.ceil((p.y + size.y - desktop.rows) * 2) / 2;
    return view;
  }

  window.ZenoDesktop = {
    widgets: WIDGETS,
    definition: definition,
    copy: copy,
    ids: ids,
    normalise: normalise,
    neighbour: neighbour,
    move: move,
    resize: resize,
    span: span,
    point: point,
    free: free,
    camera: camera,
    geometry: geometry,
    limit: LIMIT
  };
})();
