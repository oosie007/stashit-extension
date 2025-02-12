document.getElementById('save').addEventListener('click', () => {
  const userId = document.getElementById('userId').value;
  chrome.storage.local.set({ userId: userId }, () => {
    alert('Settings saved!');
  });
});

// Load saved settings
chrome.storage.local.get(['userId'], (result) => {
  if (result.userId) {
    document.getElementById('userId').value = result.userId;
  }
}); 