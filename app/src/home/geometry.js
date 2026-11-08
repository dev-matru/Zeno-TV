/* Pure layout arithmetic for the Home layouts, on the fixed 1920×1080 stage.
   Nothing here touches the DOM; render code asks for boxes and offsets. */
(function (Z) {
  'use strict';

  var STAGE_W = 1920,
    DOCK_BOTTOM = 908,
    DOCK_PAD = 16,
    GAP = 8,
    MAX_VISIBLE = 5;
  /* Tile size and pitch per app style. */
  var TILES = {
    both: { tw: 288, th: 200, pitch: 296 },
    text: { tw: 288, th: 104, pitch: 296 },
    icons: { tw: 140, th: 144, pitch: 148 }
  };
  var EMPTY = { w: 912, shelf: 880 },
    BROAD = { w: 1728, shelf: 1696 };

  /* count < 0 means "no apps": the dock shows its empty-state width. Above five apps
     the dock spans the stage and scrolls continuously ("broad"); otherwise it hugs
     the visible tiles and pages one tile at a time. */
  function dock(count, style, allowBroad) {
    var t = TILES[style],
      visible = Math.max(1, Math.min(MAX_VISIBLE, count));
    var broad = !!allowBroad && count > MAX_VISIBLE,
      shelf,
      width;
    if (count < 0) {
      width = EMPTY.w;
      shelf = EMPTY.shelf;
    } else if (broad) {
      width = BROAD.w;
      shelf = BROAD.shelf;
    } else {
      shelf = visible * t.pitch - GAP;
      width = shelf + 2 * DOCK_PAD;
    }
    return {
      x: Math.round((STAGE_W - width) / 2),
      y: DOCK_BOTTOM - t.th - 2 * DOCK_PAD,
      w: width,
      h: t.th + 2 * DOCK_PAD,
      shelf: shelf,
      vis: visible,
      broad: broad,
      empty: count < 0,
      tw: t.tw,
      th: t.th,
      pitch: t.pitch
    };
  }

  /* Horizontal offset of the track so tile `index` is visible.
     Broad docks keep half a tile of each neighbour showing; paged docks move the window
     by one tile when focus crosses an edge. `memory` ({first, off}) carries the scroll
     position between renders and is left alone while `frozen` (during a reflow). */
  function dockOffset(count, index, g, memory, frozen) {
    if (!g.broad) {
      var first = Z.util.clamp(memory.first, 0, Math.max(0, count - g.vis));
      if (index < first) first = index;
      else if (index > first + g.vis - 1) first = index - g.vis + 1;
      if (!frozen) {
        memory.first = first;
        memory.off = first;
      }
      return first * g.pitch;
    }
    var peek = g.tw / 2,
      start = index * g.pitch,
      end = start + g.tw;
    var before = index > 0 ? peek : 0,
      after = index < count - 1 ? peek : 0;
    var off = memory.off * g.pitch;
    if (start - off < before) off = start - before;
    if (end - off > g.shelf - after) off = end - g.shelf + after;
    off = Z.util.clamp(off, 0, Math.max(0, count * g.pitch - GAP - g.shelf));
    if (!frozen) {
      memory.off = off / g.pitch;
      memory.first = Math.round(memory.off);
    }
    return off;
  }

  /* The photo list: big type rows down the left edge, 128px apart, five on screen. */
  var LIST = { pitch: 128, visible: 5, rowsTop: 148, plateTop: 221, plateH: 134, lead: 3 };
  /* First visible row: focus may sit anywhere from the second to the fourth row before
     the window scrolls, which keeps one row of context above the focus. */
  function listFirst(remembered, anchor, count) {
    var clamp = Z.util.clamp,
      first = clamp(remembered, anchor - LIST.lead, anchor - 1);
    return clamp(first, 0, Math.max(0, count - LIST.visible));
  }

  Z.geometry = {
    TILES: TILES,
    GAP: GAP,
    PAD: DOCK_PAD,
    LIST: LIST,
    LIST_HEIGHT: 944,
    dock: dock,
    dockOffset: dockOffset,
    listFirst: listFirst
  };
})(window.Zeno);
