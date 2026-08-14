/* Small, shared DOM primitives used by the editor and player views. */
(function (root) {
  function element(idOrElement) {
    return typeof idOrElement === 'string' ? document.getElementById(idOrElement) : idOrElement;
  }

  function setHidden(idOrElement, hidden) {
    const node = element(idOrElement);
    if (node) node.classList.toggle('hidden', Boolean(hidden));
    return node;
  }

  function setText(idOrElement, value) {
    const node = element(idOrElement);
    if (node) node.textContent = String(value ?? '');
    return node;
  }

  function showCompatibilityError({ hiddenIds = [], gameLabel, artifactVersion, currentVersion, backHref = 'editor.html' }) {
    hiddenIds.forEach(id => setHidden(id, true));
    const overlay = document.createElement('div');
    overlay.className = 'vnfairy-compatibility-error';
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;justify-content:center;align-items:center;background:#0f172a;color:#e2e8f0;font-family:var(--font-sans);padding:20px;box-sizing:border-box;z-index:99999;';

    const panel = document.createElement('div');
    panel.className = 'glass-panel';
    panel.style.cssText = 'max-width:500px;padding:30px;text-align:center;border:1px solid rgba(239,68,68,0.2);border-radius:12px;background:rgba(30,41,59,0.7);box-shadow:0 10px 30px rgba(0,0,0,0.5);';
    const icon = document.createElement('div');
    icon.textContent = '⚠️';
    icon.style.cssText = 'font-size:3.5rem;margin-bottom:15px;color:#ef4444;';
    const title = document.createElement('h2');
    title.textContent = 'Version Incompatibility';
    title.style.cssText = 'margin:0 0 12px 0;font-size:1.5rem;font-family:var(--font-display);font-weight:700;';
    const message = document.createElement('p');
    message.style.cssText = 'margin:0 0 20px 0;font-size:0.95rem;color:#94a3b8;line-height:1.6;';
    message.textContent = `This ${gameLabel || 'artifact'} was created in a newer version of VNFairy (v${artifactVersion}). Your current version is v${currentVersion}.`;
    const hint = document.createElement('p');
    hint.textContent = 'Please update VNFairy to the latest version to continue.';
    hint.style.cssText = 'margin:0 0 24px 0;font-size:0.85rem;color:#64748b;line-height:1.5;font-style:italic;';
    const button = document.createElement('button');
    button.className = 'btn-secondary';
    button.textContent = 'Back';
    button.style.cssText = 'padding:10px 20px;font-size:0.9rem;';
    button.onclick = () => window.location.href = backHref;
    panel.append(icon, title, message, hint, button);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    return overlay;
  }

  (typeof window !== 'undefined' ? window : root).VNFairyDom = { element, setHidden, setText, showCompatibilityError };
})(typeof window !== 'undefined' ? window : globalThis);
