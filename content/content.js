// --- Floating Button Container ---
let floatBox = null;

function ensureFloatBox() {
  if (floatBox) return;
  floatBox = document.createElement('div');
  floatBox.id = 'ai-float-buttons';
  floatBox.innerHTML = `
    <button id="ai-btn-explain" title="AI 解释代码">解释</button>
    <button id="ai-btn-translate" title="AI 翻译">翻译</button>
    <button id="ai-btn-summarize" title="AI 摘要页面">摘要</button>
    <button id="ai-btn-readpage" title="读取页面内容">读取</button>
    <button id="ai-btn-highlight" title="高亮标记">高亮</button>
  `;
  document.body.appendChild(floatBox);

  floatBox.querySelector('#ai-btn-explain').addEventListener('mousedown', (e) => {
    e.preventDefault();
    sendQuery('explain');
  });
  floatBox.querySelector('#ai-btn-translate').addEventListener('mousedown', (e) => {
    e.preventDefault();
    sendQuery('translate');
  });
  floatBox.querySelector('#ai-btn-summarize').addEventListener('mousedown', (e) => {
    e.preventDefault();
    sendQuery('summarize');
  });
  floatBox.querySelector('#ai-btn-readpage').addEventListener('mousedown', (e) => {
    e.preventDefault();
    sendQuery('readpage');
  });
  floatBox.querySelector('#ai-btn-highlight').addEventListener('mousedown', (e) => {
    e.preventDefault();
    doHighlight();
  });

  // Hide floatBox when clicking elsewhere
  document.addEventListener('mousedown', (e) => {
    if (floatBox && !floatBox.contains(e.target)) {
      floatBox.classList.remove('visible');
    }
  }, true);
}

function sendQuery(mode) {
  let text;
  if (mode === 'summarize' || mode === 'readpage') {
    text = extractPageContent().substring(0, 16000);
    if (!text) return;
  } else {
    text = window.getSelection().toString().trim();
    if (!text) return;
  }
  chrome.runtime.sendMessage({ type: 'QUERY_AI', text, mode });
  floatBox.classList.remove('visible');
}

// --- Highlight ---
function doHighlight() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;

  const range = sel.getRangeAt(0);
  const text = range.toString().trim();
  if (!text) return;

  // Create a unique id for this highlight
  const hid = 'hl-' + Date.now();
  const mark = document.createElement('mark');
  mark.className = 'ai-highlight';
  mark.dataset.hid = hid;
  mark.textContent = text;
  mark.className = 'ai-highlight new-highlight';

  range.deleteContents();
  range.insertNode(mark);

  // Remove animation class after it ends
  mark.addEventListener('animationend', () => {
    mark.classList.remove('new-highlight');
  }, { once: true });

  // Persist to storage
  saveHighlight(hid, text, getPageKey());

  floatBox.classList.remove('visible');
  sel.removeAllRanges();
}

function getPageKey() {
  return window.location.origin + window.location.pathname;
}

function saveHighlight(hid, text, pageKey) {
  chrome.storage.local.get({ highlights: {} }, (data) => {
    const all = data.highlights;
    if (!all[pageKey]) all[pageKey] = {};
    all[pageKey][hid] = text;
    chrome.storage.local.set({ highlights: all });
  });
}

function removeHighlight(hid) {
  chrome.storage.local.get({ highlights: {} }, (data) => {
    const all = data.highlights;
    const pageKey = getPageKey();
    if (all[pageKey]) {
      delete all[pageKey][hid];
      chrome.storage.local.set({ highlights: all });
    }
  });
}

// Click a highlight to remove it
document.addEventListener('click', (e) => {
  if (e.target.matches('mark.ai-highlight')) {
    const mark = e.target;
    const hid = mark.dataset.hid;
    mark.classList.add('removing');
    let removed = false;
    mark.addEventListener('transitionend', () => {
      if (removed || !mark.parentNode) return;
      removed = true;
      const parent = mark.parentNode;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize();
    }, { once: true });
    removeHighlight(hid);
  }
});

// --- Restore highlights on page load ---
function restoreHighlights() {
  const pageKey = getPageKey();
  chrome.storage.local.get({ highlights: {} }, (data) => {
    const pageHighlights = data.highlights[pageKey];
    if (!pageHighlights) return;
    const textToFind = Object.values(pageHighlights);
    if (textToFind.length === 0) return;

    // Walk text nodes to find and highlight matching text
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (node.parentElement.closest('script,style,noscript,mark,textarea,input')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    // For each stored highlight text, attempt to find and mark it
    // We iterate through found texts and try to match
    const pendingTexts = [...textToFind];
    const nodeRanges = [];

    // Simple approach: for each text node, try to find any pending text within it
    let node;
    while ((node = walker.nextNode()) && pendingTexts.length > 0) {
      const nodeText = node.textContent;
      for (let i = pendingTexts.length - 1; i >= 0; i--) {
        const idx = nodeText.indexOf(pendingTexts[i]);
        if (idx !== -1) {
          // Find which HID this text belongs to
          let matchedHid = null;
          for (const [hid, txt] of Object.entries(pageHighlights)) {
            if (txt === pendingTexts[i]) {
              matchedHid = hid;
              break;
            }
          }
          if (matchedHid) {
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + pendingTexts[i].length);
            const mark = document.createElement('mark');
            mark.className = 'ai-highlight';
            mark.dataset.hid = matchedHid;
            mark.textContent = pendingTexts[i];
            range.deleteContents();
            range.insertNode(mark);
          }
          pendingTexts.splice(i, 1);
          break; // re-walk from the modified node
        }
      }
    }
  });
}

// --- Selection detection ---
document.addEventListener('mouseup', (e) => {
  // Ignore if clicking on floatBox or highlight
  if (e.target.closest('#ai-float-buttons') || e.target.closest('mark.ai-highlight')) return;

  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel.toString().trim();
    if (!text || text.length === 0) {
      if (floatBox) floatBox.classList.remove('visible');
      return;
    }

    // Position floatBox near selection
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    ensureFloatBox();

    // Use viewport-relative coords (floatBox is position:fixed)
    let top = rect.bottom + 6;
    let left = rect.left;

    // Keep within viewport
    const boxW = 230;
    if (left + boxW > window.innerWidth - 10) {
      left = window.innerWidth - boxW - 10;
    }
    if (left < 0) left = 6;
    if (top > window.innerHeight - 60) {
      top = rect.top - 44;
    }

    floatBox.style.top = top + 'px';
    floatBox.style.left = left + 'px';
    floatBox.classList.add('visible');
  }, 0);
});

// --- Listen for requests ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_SELECTED_TEXT') {
    const text = window.getSelection().toString().trim();
    sendResponse({ text: text || '' });
    return true;
  }
  if (msg.type === 'GET_PAGE_CONTENT') {
    const content = extractPageContent();
    sendResponse({ content });
    return true;
  }
  if (msg.type === 'HIGHLIGHT_SELECTION') {
    doHighlight();
    return false;
  }
  return false;
});

function extractPageContent() {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'HEAD', 'META', 'LINK']);
  const SKIP_CLASSES = ['sidebar', 'nav', 'menu', 'ad', 'comment', 'footer-bar'];

  // Prefer main content area, fallback to body
  const root = document.querySelector('article, main, [role="main"], .content, .post, .article') || document.body;

  const parts = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
        const cls = (node.className || '').toLowerCase();
        const id = (node.id || '').toLowerCase();
        for (const c of SKIP_CLASSES) {
          if (cls.includes(c) || id.includes(c)) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP; // skip element but walk into children
      }
      // Text node
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('script,style,noscript,header,footer,nav,iframe,svg,pre,code')) return NodeFilter.FILTER_REJECT;
      const text = node.textContent.trim();
      return text ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  while (walk.nextNode()) {
    const text = walk.currentNode.textContent.trim();
    if (text) parts.push(text);
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim().substring(0, 16000);
}

// --- Init ---
restoreHighlights();
