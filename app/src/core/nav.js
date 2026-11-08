/* Focus movement helpers shared by the views. */
(function (Z) {
  'use strict';

  /* Moves `index` in a row-major grid of `count` cells, `cols` wide.
     Returns the new index, or -1 when Up leaves the top row. Down from a row above a
     shorter last row lands on that row's last cell. */
  function grid(index, count, cols, key) {
    var col = index % cols,
      row = Math.floor(index / cols),
      rows = Math.ceil(count / cols);
    if (key === 'left') return col > 0 ? index - 1 : index;
    if (key === 'right') return col < cols - 1 && index < count - 1 ? index + 1 : index;
    if (key === 'down') return row < rows - 1 ? Math.min(index + cols, count - 1) : index;
    if (key === 'up') return row > 0 ? index - cols : -1;
    return index;
  }

  /* Index that keeps `index` visible in a window of `size` rows starting at `first`. */
  function windowStart(first, index, size, count) {
    var start = Math.min(first, index);
    if (index > start + size - 1) start = index - size + 1;
    return Math.max(0, Math.min(start, Math.max(0, count - size)));
  }

  Z.nav = { grid: grid, windowStart: windowStart };
})(window.Zeno);
