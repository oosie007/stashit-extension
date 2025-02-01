// Constants (same as in popup.js)
const PROJECT_ID = 'izcbuvdlbiifmalkdghs';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6Y2J1dmRsYmlpZm1hbGtkZ2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyMzE3NjEsImV4cCI6MjA1MzgwNzc2MX0.kqGZg5jK2armE2rM2KkKKUubfqZjUL7vXAP46ZJeTlI'
const BASE_URL = `https://${PROJECT_ID}.supabase.co`;

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'stashHighlight',
    title: 'StashIt: Save Highlight',
    contexts: ['selection']
  });
});

// Function to get main image from the page
async function getMainImage(tabId) {
  const [{ result: imageUrl }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const isValidUrl = (url) => {
        try {
          new URL(url);
          return url.startsWith('http') || url.startsWith('https');
        } catch {
          return false;
        }
      };

      // Try meta tags first
      const metaTags = {
        'og:image': document.querySelector('meta[property="og:image"]')?.content,
        'og:image:secure_url': document.querySelector('meta[property="og:image:secure_url"]')?.content,
        'twitter:image': document.querySelector('meta[name="twitter:image"]')?.content,
        'twitter:image:src': document.querySelector('meta[name="twitter:image:src"]')?.content,
      };

      // Check meta tags
      for (const [key, value] of Object.entries(metaTags)) {
        if (value && isValidUrl(value)) return value;
      }

      // Fallback to largest image
      const images = Array.from(document.getElementsByTagName('img'))
        .filter(img => {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          return width > 100 && height > 100 && isValidUrl(img.src);
        })
        .sort((a, b) => {
          const areaA = (a.naturalWidth || a.width) * (a.naturalHeight || a.height);
          const areaB = (b.naturalWidth || b.width) * (b.naturalHeight || b.height);
          return areaB - areaA;
        });

      return images[0]?.src || '';
    }
  });
  return imageUrl;
}

// Function to get page summary
async function getPageSummary(tabId) {
  const [{ result: summary }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const metaDescription = document.querySelector('meta[name="description"]')?.content
        || document.querySelector('meta[property="og:description"]')?.content
        || document.querySelector('meta[name="twitter:description"]')?.content;

      if (metaDescription) return metaDescription;

      const mainContent = document.body.innerText;
      const briefSummary = mainContent
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 250)
        .replace(/\s\S*$/, '');

      return briefSummary + '...';
    }
  });
  return summary;
}

// Updated saveToSupabase function for background.js
async function saveToSupabase(data) {
  // Get session from storage
  const session = await chrome.storage.local.get('session');
  if (!session.session) {
    throw new Error('Not authenticated');
  }

  // Add user_id to the data
  const dataWithUser = {
    ...data,
    user_id: session.session.user.id
  };

  const response = await fetch(`${BASE_URL}/rest/v1/stashed_items`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(dataWithUser)
  });

  if (!response.ok) {
    throw new Error(`Failed to save: ${response.status}`);
  }

  return response.json();
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'stashHighlight') {
    try {
      // Get the main image and summary
      const [mainImageUrl, pageSummary] = await Promise.all([
        getMainImage(tab.id),
        getPageSummary(tab.id)
      ]);

      // Prepare data
      const data = {
        type: 'highlight',
        title: tab.title,
        url: tab.url,
        summary: pageSummary,
        content: '',
        tags: [],
        created_at: new Date().toISOString(),
        image_url: mainImageUrl,
        highlighted_text: info.selectionText
      };

      // Save to Supabase
      await saveToSupabase(data);

      // Show success notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'StashIt',
        message: 'Highlight saved successfully!'
      });

    } catch (error) {
      console.error('Error saving highlight:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'StashIt',
        message: 'Failed to save highlight'
      });
    }
  }
}); 