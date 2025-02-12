// Listen for extension button click
chrome.action.onClicked.addListener((tab) => {
  // Get user ID from storage
  chrome.storage.local.get(['userId'], (result) => {
    const userId = result.userId;
    
    if (!userId) {
      // Handle not logged in state
      chrome.runtime.openOptionsPage();
      return;
    }

    // Send message to content script
    chrome.tabs.sendMessage(tab.id, {
      action: 'saveUrl',
      userId: userId
    });
  });
});

// Handle notifications
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'StashIt',
      message: request.message
    });
  }
}); 