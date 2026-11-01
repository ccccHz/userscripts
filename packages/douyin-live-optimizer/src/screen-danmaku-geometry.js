// Match the local Bilibili hover-actions interaction: outside the selected
// text, below first, above when needed, bounded by the visible player.
export function placeScreenToolbar({ pointerX, item, player, width, height }) {
  const left = Math.max(player.left + 8, Math.min(pointerX - width / 2, player.right - width - 8));
  const below = item.bottom + 8;
  const top = below + height + 8 <= player.bottom ? below : Math.max(player.top + 8, item.top - height - 8);
  return { left, top };
}

export function inToolbarBridge(x, y, item, toolbar) {
  const above = toolbar.bottom <= item.top;
  const top = above ? toolbar.bottom - 2 : item.bottom - 2;
  const bottom = above ? item.top + 2 : toolbar.top + 2;
  return x >= toolbar.left - 6 && x <= toolbar.right + 6 && y >= top && y <= bottom;
}
