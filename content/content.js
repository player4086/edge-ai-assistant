// --- Floating Button Container ---
let floatBox = null;

function ensureFloatBox() {
  if (floatBox) return;
  floatBox = document.createElement('div');
  floatBox.id = 'ai-float-buttons';
  floatBox.innerHTML = `
    <button id="ai-btn-explain" title="AI 解释代码">解释</button>
    <button id="ai-btn-translate" title="AI 翻译">翻译</button>
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
  floatBox.querySelector('#ai-btn-highlight').addEventListener('mousedown', (e) => {
    e.preventDefault();
    doHighlight();
  });

  // Hide floatBox when clicking elsewhere
  document.addEventListener('mousedown', (e) => {
    if (floatBox && !floatBox.contains(e.target)) {
      floatBox.style.display = 'none';
    }
  }, true);
}

function sendQuery(mode) {
  const text = window.getSelection().toString().trim();
  if (!text) return;
  chrome.runtime.sendMessage({ type: 'QUERY_AI', text, mode });
  floatBox.style.display = 'none';
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

  range.deleteContents();
  range.insertNode(mark);

  // Persist to storage
  saveHighlight(hid, text, getPageKey());

  floatBox.style.display = 'none';
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
    const parent = mark.parentNode;
    // Replace mark with its text content
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
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
      if (floatBox) floatBox.style.display = 'none';
      return;
    }

    // Position floatBox near selection
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    ensureFloatBox();

    let top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;

    // Keep within viewport
    const boxW = 230; // approximate width
    if (left + boxW > window.innerWidth - 10) {
      left = window.innerWidth - boxW - 10 - window.scrollX;
    }
    if (left < 0) left = 0;
    if (top - window.scrollY > window.innerHeight - 60) {
      top = rect.top + window.scrollY - 44;
    }

    floatBox.style.top = top + 'px';
    floatBox.style.left = left + 'px';
    floatBox.style.display = 'block';
  }, 0);
});

// --- Listen for request from sidepanel ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_SELECTED_TEXT') {
    const text = window.getSelection().toString().trim();
    if (text) {
      sendResponse({ text });
    }
    return true;
  }
  return false;
});

// --- Init ---
restoreHighlights();
