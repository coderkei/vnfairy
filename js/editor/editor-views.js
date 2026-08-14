/* Editor-specific DOM views kept outside the editor controller. */
(function (root) {
  function renderRecoveryList(list, snapshots, onRestore) {
    list.innerHTML = '';
    if (!snapshots.length) {
      list.innerHTML = '<div class="recovery-empty">No previous successful saves are available yet.</div>';
      return;
    }
    snapshots.forEach(snapshot => {
      const row = document.createElement('div');
      row.className = 'recovery-row';
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = new Date(snapshot.savedAt).toLocaleString();
      const summary = document.createElement('span');
      summary.textContent = ` ${snapshot.sceneCount} scene${snapshot.sceneCount === 1 ? '' : 's'} · ${snapshot.title}`;
      details.append(title, summary);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-secondary';
      button.textContent = 'Restore this version';
      button.onclick = () => onRestore(snapshot.id);
      row.append(details, button);
      list.appendChild(row);
    });
  }

  (typeof window !== 'undefined' ? window : root).VNFairyEditorViews = { renderRecoveryList };
})(typeof window !== 'undefined' ? window : globalThis);
