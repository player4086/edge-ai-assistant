// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ai-explain',
    title: 'AI 解释代码',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ai-translate',
    title: 'AI 翻译',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const mode = info.menuItemId === 'ai-explain' ? 'explain' : 'translate';
  const text = info.selectionText;
  if (!text) return;

  // Open side panel and relay the selected text
  chrome.sidePanel.open({ tabId: tab.id }).then(() => {
    // Brief delay to ensure sidepanel is ready to receive messages
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'QUERY_AI',
        text: text.trim(),
        mode: mode
      });
    }, 300);
  });
});

// --- Relay messages from content script to sidepanel ---
chrome.runtime.onMessage.addListener((msg, sender) => {
  // Content-script requested AI query — open sidepanel and forward
  if (msg.type === 'QUERY_AI' && sender.tab) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'QUERY_AI',
          text: msg.text,
          mode: msg.mode
        });
      }, 300);
    });
    return true;
  }

  // Sidepanel requesting selected text from active tab
  if (msg.type === 'GET_SELECTED_TEXT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTED_TEXT' }, (resp) => {
          if (chrome.runtime.lastError) return;
        });
      }
    });
    return true;
  }
  return false;
});
