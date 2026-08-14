/* Player-only DOM views. Game state and branching remain outside this layer. */
(function (root) {
  function renderProjectSelection(list, projects) {
    list.innerHTML = '';
    if (!projects.length) {
      list.innerHTML = '<div class="muted" style="text-align:center;padding:20px 0;font-size:0.95rem;">No visual novels found on the server.</div>';
      return;
    }
    projects.forEach(project => {
      const item = document.createElement('div');
      item.className = 'portal-item';
      item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:var(--bg-card);border:1px solid var(--border-color);padding:16px 20px;border-radius:var(--radius-md);transition:border-color 0.2s,background 0.2s;';
      const details = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = project.title || project.id;
      title.style.cssText = 'font-family:var(--font-display);font-weight:700;font-size:1.1rem;color:var(--text-main);';
      const author = document.createElement('div');
      author.textContent = `by ${project.author || 'Unknown'}`;
      author.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin-top:2px;';
      details.append(title, author);
      const button = document.createElement('button');
      button.className = 'btn-primary';
      button.textContent = 'Play Game';
      button.style.cssText = 'padding:8px 16px;font-size:0.85rem;';
      button.onclick = () => window.location.search = `?project=${encodeURIComponent(project.id)}`;
      item.append(details, button);
      list.appendChild(item);
    });
  }

  (typeof window !== 'undefined' ? window : root).VNFairyPlayerViews = { renderProjectSelection };
})(typeof window !== 'undefined' ? window : globalThis);
