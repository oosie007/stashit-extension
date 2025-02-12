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