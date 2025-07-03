// Simple persistent highlight content script for StashIt

console.log("StashIt content script loaded");

// Add highlight CSS
const style = document.createElement('style');
style.textContent = `.stashit-highlight { background: yellow; color: black; border-radius: 2px; padding: 0 2px; }`;
document.head.appendChild(style);

// Helper: highlight the first occurrence of text in the page
function highlightText(text) {
  if (!text) return;
  // Search all text nodes in the body
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    const idx = node.nodeValue.indexOf(text);
    if (idx !== -1) {
      // Split the text node and wrap the match in <mark>
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + text.length);
      const mark = document.createElement('mark');
      mark.className = 'stashit-highlight';
      range.surroundContents(mark);
      console.log('Applied highlight for text:', text);
      return true;
    }
  }
  console.log('Highlight text not found in page:', text);
  return false;
}

// Listen for highlight stash requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'STASH_HIGHLIGHT') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const text = selection.toString();
      // Highlight the selection visually
      highlightText(text);
      // Save the highlighted text and URL
      chrome.runtime.sendMessage({
        action: 'SAVE_HIGHLIGHT_TO_SUPABASE',
        text,
        url: window.location.href,
        title: document.title
      });
    }
  }
});

// On page load, fetch highlights for this URL and highlight them
console.log("Requesting highlights for", window.location.href);
chrome.runtime.sendMessage({ action: 'GET_HIGHLIGHTS_FOR_URL', url: window.location.href }, (highlights) => {
  console.log("Highlights returned:", highlights);
  if (!Array.isArray(highlights)) return;
  highlights.forEach(h => {
    // h.text is the highlighted text
    highlightText(h.text || h.highlighted_text);
  });
});

// When the user clicks the extension button
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveUrl') {
    // Get the current page info
    const data = {
      type: 'link',
      url: window.location.href,
      title: document.title,
      content: '', // The server will scrape this
      tags: [], // You can add tag functionality later
      user_id: request.userId // This should come from your extension's storage
    };

    // Send to your API
    fetch('https://your-domain.com/api/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
      // Show success notification
      chrome.runtime.sendMessage({
        action: 'showNotification',
        message: 'Page saved successfully!'
      });
    })
    .catch(error => {
      console.error('Error saving page:', error);
      // Show error notification
      chrome.runtime.sendMessage({
        action: 'showNotification',
        message: 'Failed to save page'
      });
    });
  }
}); 