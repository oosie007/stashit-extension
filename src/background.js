// Constants (same as in popup.js)
const PROJECT_ID = 'izcbuvdlbiifmalkdghs';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6Y2J1dmRsYmlpZm1hbGtkZ2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyMzE3NjEsImV4cCI6MjA1MzgwNzc2MX0.kqGZg5jK2armE2rM2KkKKUubfqZjUL7vXAP46ZJeTlI'
const BASE_URL = `https://${PROJECT_ID}.supabase.co`;

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  // First remove existing menu items to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    // Then create the new menu items
    chrome.contextMenus.create({
      id: "stashit-highlight",
      title: "StashIt: Save Highlight",
      contexts: ["selection"]
    });

    // New image menu
    chrome.contextMenus.create({
      id: "stashit-image",
      title: "StashIt image",
      contexts: ["image"]
    });
  });
});

// Updated saveToSupabase function for background.js
async function saveToSupabase(data) {
  try {
    const session = await chrome.storage.local.get('session');
    if (!session.session) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${BASE_URL}/rest/v1/stashed_items`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${session.session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        ...data,
        user_id: session.session.user.id,
        created_at: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to save: ${response.status} - ${error}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error in saveToSupabase:', error);
    throw error;
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "stashit-highlight") {
    try {
      // Check authentication first
      const session = await chrome.storage.local.get('session');
      if (!session.session) {
        chrome.windows.create({
          url: chrome.runtime.getURL("src/popup.html") + "?auth=true",
          type: "popup",
          width: 400,
          height: 600
        });
        return;
      }

      // Get image URL only
      const [imageResult] = await Promise.all([
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Special handling for YouTube
            if (window.location.hostname.includes('youtube.com')) {
              // Try to get video thumbnail
              const videoId = new URLSearchParams(window.location.search).get('v');
              if (videoId) {
                // Use highest quality thumbnail available
                return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
              }
            }
            
            // Regular image detection for other sites
            let maxImage = '';
            let maxSize = 0;
            
            // First check meta images
            const ogImage = document.querySelector('meta[property="og:image"]')?.content;
            if (ogImage) return ogImage;
            
            const twitterImage = document.querySelector('meta[name="twitter:image"]')?.content;
            if (twitterImage) return twitterImage;
            
            // Then check all images
            document.querySelectorAll('img').forEach(img => {
              const size = (img.naturalWidth || img.width) * (img.naturalHeight || img.height);
              if (size > maxSize && img.src && !img.src.includes('logo')) {
                maxSize = size;
                maxImage = img.src;
              }
            });
            
            return maxImage;
          }
        })
      ]);

      // If authenticated, prepare the data
      const data = {
        type: 'highlight',
        title: tab.url.includes('youtube.com')
          ? tab.title.replace(/^\([0-9]+\)\s*/, '') // Remove notification count prefix
          : tab.title,
        url: tab.url,
        tags: [],
        highlighted_text: info.selectionText,
        user_id: session.session.user.id,
        image_url: imageResult[0]?.result || null
      };

      // Save directly to Supabase
      await saveToSupabase(data);

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'src/icons/icon128.png',
        title: 'StashIt',
        message: 'Highlight saved successfully!'
      });

    } catch (error) {
      console.error('Error saving highlight:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'src/icons/icon128.png',
        title: 'StashIt',
        message: 'Failed to save highlight'
      });
    }
  }
  
  if (info.menuItemId === "stashit-image") {
    try {
      // Check authentication first
      const session = await chrome.storage.local.get('session');
      if (!session.session) {
        chrome.windows.create({
          url: chrome.runtime.getURL("src/popup.html") + "?auth=true",
          type: "popup",
          width: 400,
          height: 600
        });
        return;
      }

      // Prepare data for saving image
      const data = {
        type: 'saved_image',
        title: tab.url.includes('youtube.com')
          ? tab.title.replace(/^\([0-9]+\)\s*/, '') // Remove notification count prefix
          : tab.title,
        url: tab.url,
        tags: [],
        user_id: session.session.user.id,
        image_url: info.srcUrl
      };

      // Save to Supabase
      await saveToSupabase(data);

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'src/icons/icon128.png',
        title: 'StashIt',
        message: 'Image saved successfully!'
      });

    } catch (error) {
      console.error('Error saving image:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'src/icons/icon128.png',
        title: 'StashIt',
        message: 'Failed to save image'
      });
    }
  }
}); 