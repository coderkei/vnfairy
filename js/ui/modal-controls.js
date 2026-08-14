/* Shared modal controls. Page-specific controllers may still provide audio. */
(function (root) {
  function close(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
  }

  function confirm(message, onAction) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      const messageEl = document.getElementById('confirm-modal-message');
      const yes = document.getElementById('btn-confirm-yes');
      const no = document.getElementById('btn-confirm-no');
      if (!modal || !messageEl || !yes || !no) {
        resolve(window.confirm(message));
        return;
      }
      messageEl.textContent = message;
      modal.classList.remove('hidden');
      const finish = value => {
        if (typeof onAction === 'function') onAction();
        modal.classList.add('hidden');
        resolve(value);
      };
      yes.onclick = () => finish(true);
      no.onclick = () => finish(false);
    });
  }

  (typeof window !== 'undefined' ? window : root).VNFairyModalControls = { close, confirm };
})(typeof window !== 'undefined' ? window : globalThis);
