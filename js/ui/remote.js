const DIRECTIONS = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};

// Retain the existing forward + 3 * sideways scoring used on the TV.
export function chooseDirectionalTarget(current, candidates, key) {
  const direction = DIRECTIONS[key];
  if (!direction) return null;
  let best = null, score = Infinity;
  for (const candidate of candidates) {
    const box = candidate.rect;
    const dx = box.x + box.width / 2 - current.x - current.width / 2;
    const dy = box.y + box.height / 2 - current.y - current.height / 2;
    const forward = dx * direction[0] + dy * direction[1];
    const distance = forward + Math.abs(dx * direction[1] - dy * direction[0]) * 3;
    if (forward > 1 && distance < score) { best = candidate; score = distance; }
  }
  return best;
}

export function createRemoteNavigation({document, player, playlist, connection, catalog, importButton}) {
  function onKeyDown(event) {
    const key = event.key || {37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown'}[event.keyCode];
    const back = key === 'Escape' || event.keyCode === 10009;
    const dialog = [playlist, connection].find(candidate => candidate?.isOpen());
    if (dialog) {
      event.stopImmediatePropagation();
      if (back) { event.preventDefault(); dialog.close(); return; }
      const controls = [...dialog.modal.querySelectorAll('input,button')].filter(item => !item.disabled);
      const index = controls.indexOf(document.activeElement);
      if (key === 'ArrowDown' || key === 'ArrowUp' || (!(dialog.inputs || [dialog.input]).includes(document.activeElement) && ['ArrowLeft', 'ArrowRight'].includes(key))) {
        event.preventDefault();
        const step = ['ArrowUp', 'ArrowLeft'].includes(key) ? -1 : 1;
        controls[(index + step + controls.length) % controls.length]?.focus();
      }
      if (key === 'Tab') {
        event.preventDefault();
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      }
      if (key === 'Enter' && document.activeElement === dialog.remember) {
        event.preventDefault(); dialog.remember.checked = !dialog.remember.checked;
      }
      return;
    }
    if (back) {
      if (player.isOpen()) { event.preventDefault(); player.close(); }
      else if (catalog.goBack?.()) event.preventDefault();
      return;
    }
    if (document.activeElement.tagName === 'SELECT') {
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault();
        const target = key === 'ArrowLeft' ? document.querySelector('nav button.active') : document.querySelector('#channels .channel');
        (target || importButton).focus();
      }
      return;
    }
    if (!DIRECTIONS[key]) return;
    event.preventDefault();
    if (!player.isOpen() && key === 'ArrowRight' && document.activeElement.closest('nav')) {
      (document.querySelector('#channels .channel') || document.querySelector('#channels button') || importButton).focus();
      return;
    }
    if (!player.isOpen() && key === 'ArrowLeft' && document.activeElement === document.querySelector('#channels .channel')) {
      (document.querySelector('nav button.active') || importButton).focus(); return;
    }
    const selector = 'button,select';
    const candidates = [...document.querySelectorAll(selector)].filter(button =>
      button !== document.activeElement && !button.disabled && button.getClientRects().length &&
      (!player.isOpen() || document.getElementById('player').contains(button))
    ).map(element => ({element, rect: element.getBoundingClientRect()}));
    chooseDirectionalTarget(document.activeElement.getBoundingClientRect(), candidates, key)?.element.focus();
  }
  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}
