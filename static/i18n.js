/* i18n.js — minimal bilingual EN/FR switcher, no dependencies, no build.
 *
 * Translates whole text-node fragments and common attributes by matching
 * them against a dictionary of {en, fr} pairs (window.I18N_PAIRS). It is
 * language-symmetric: it works whether the page's base language is English
 * or French, and toggling back and forth is lossless because every known
 * string maps to its counterpart in either direction.
 *
 * Dynamically inserted / rewritten DOM (e.g. JS that sets textContent) is
 * caught by a MutationObserver, so single-page apps that render text at
 * runtime get translated too. The choice persists in localStorage and a
 * <select> control is auto-injected (or mounted into [data-i18n-switch]).
 */
(function () {
  var PAIRS = window.I18N_PAIRS || [];
  var STORE_KEY = 'site-lang';
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  var byEn = Object.create(null);
  var byFr = Object.create(null);
  PAIRS.forEach(function (p) {
    if (p.en) byEn[p.en] = p;
    if (p.fr) byFr[p.fr] = p;
  });

  // Map a raw string to its target-language form, preserving the leading/
  // trailing whitespace of the original. Returns null when nothing changes.
  function translated(raw, lang) {
    var t = raw.trim();
    if (!t) return null;
    var pair = (lang === 'fr') ? byEn[t] : byFr[t];
    if (!pair) return null;
    var to = (lang === 'fr') ? pair.fr : pair.en;
    if (!to || to === t) return null;
    return raw.replace(t, to);
  }

  function translateTextNode(node, lang) {
    var r = translated(node.nodeValue, lang);
    if (r !== null) node.nodeValue = r;
  }

  function translateAttrs(el, lang) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      var r = translated(el.getAttribute(a), lang);
      if (r !== null) el.setAttribute(a, r);
    }
  }

  function walk(root, lang) {
    if (root.nodeType === 3) { translateTextNode(root, lang); return; }
    if (root.nodeType !== 1) return;
    if (root.closest && root.closest('[data-i18n-skip]')) return;
    translateAttrs(root, lang);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = tw.nextNode())) translateTextNode(n, lang);
    if (root.querySelectorAll) {
      var els = root.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) translateAttrs(els[i], lang);
    }
  }

  var current = 'en';

  function apply(lang) {
    current = lang;
    document.documentElement.lang = lang;
    walk(document.body, lang);
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}
    var sel = document.getElementById('lang-switch');
    if (sel) sel.value = lang;
  }

  var observer = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') { translateTextNode(m.target, current); continue; }
      for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j], current);
    }
  });

  function injectSwitch() {
    if (document.getElementById('lang-switch')) return;
    var sel = document.createElement('select');
    sel.id = 'lang-switch';
    sel.setAttribute('aria-label', 'Language / Langue');
    sel.setAttribute('data-i18n-skip', '');
    sel.innerHTML = '<option value="en">EN</option><option value="fr">FR</option>';
    sel.value = current;
    sel.addEventListener('change', function () { apply(sel.value); });
    var mount = document.querySelector('[data-i18n-switch]');
    if (mount) {
      mount.appendChild(sel);
    } else {
      sel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;' +
        'padding:4px 8px;border-radius:8px;background:rgba(20,20,28,.85);color:#fff;' +
        'border:1px solid rgba(255,255,255,.25);font:600 13px system-ui,sans-serif;cursor:pointer;';
      document.body.appendChild(sel);
    }
  }

  function start() {
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}
    current = saved || document.documentElement.lang || 'en';
    if (current !== 'en' && current !== 'fr') current = 'en';
    apply(current);
    injectSwitch();
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
