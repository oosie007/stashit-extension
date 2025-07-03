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

// --- Session Management Helpers ---
function isSessionExpired(session) {
  if (!session || !session.expires_at) return true;
  // expires_at is in seconds, Date.now() is ms
  const now = Math.floor(Date.now() / 1000);
  // Add a small buffer (e.g. 30s) to avoid race conditions
  return now > (session.expires_at - 30);
}

async function refreshSession(oldSession) {
  const refresh_token = oldSession.refresh_token;
  if (!refresh_token) throw new Error('No refresh token available');
  const response = await fetch(`${BASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refresh_token
    })
  });
  if (!response.ok) {
    throw new Error('Failed to refresh session');
  }
  const data = await response.json();
  // Supabase returns a new session object
  return data;
}

async function getValidSession() {
  const storage = await chrome.storage.local.get('session');
  let session = storage.session;
  if (!session) throw new Error('Not authenticated');
  if (!isSessionExpired(session)) return session;
  // Try to refresh
  try {
    const newSession = await refreshSession(session);
    // Store new session
    await chrome.storage.local.set({ session: newSession });
    return newSession;
  } catch (e) {
    // Refresh failed, clear session and force re-login
    await chrome.storage.local.remove('session');
    throw new Error('Session expired, please log in again');
  }
}

// Updated saveToSupabase function for background.js
async function saveToSupabase(data) {
  try {
    const session = await getValidSession();
    const response = await fetch(`${BASE_URL}/rest/v1/stashed_items`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        ...data,
        user_id: session.user.id,
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

      // Instead of saving directly, trigger robust highlight save in content script
      chrome.tabs.sendMessage(tab.id, { action: 'STASH_HIGHLIGHT' });
      // Optionally, show a notification immediately or after confirmation from content/background
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
        title: 'StashIt',
        message: 'Highlight stashing triggered!'
      });
    } catch (error) {
      console.error('Error triggering highlight save:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
        title: 'StashIt',
        message: 'Failed to trigger highlight save'
      });
    }
    return;
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
        iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
        title: 'StashIt',
        message: 'Image saved successfully!'
      });

    } catch (error) {
      console.error('Error saving image:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
        title: 'StashIt',
        message: 'Failed to save image'
      });
    }
  }
});

// Listen for highlight save/fetch requests from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Save highlight to Supabase
  if (request.action === 'SAVE_HIGHLIGHT_TO_SUPABASE') {
    (async () => {
      try {
        const session = await getValidSession();
        const data = {
          type: 'highlight',
          url: request.url,
          title: request.title,
          highlighted_text: request.text,
          user_id: session.user.id,
          created_at: new Date().toISOString()
        };
        await saveToSupabase(data);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
          title: 'StashIt',
          message: 'Highlight saved!'
        });
      } catch (error) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
          title: 'StashIt',
          message: 'Failed to save highlight'
        });
      }
    })();
    return true;
  }

  // Fetch highlights for this URL from Supabase
  if (request.action === 'GET_HIGHLIGHTS_FOR_URL') {
    (async () => {
      try {
        const session = await getValidSession();
        const url = encodeURIComponent(request.url);
        const response = await fetch(`${BASE_URL}/rest/v1/stashed_items?url=eq.${url}&type=eq.highlight&user_id=eq.${session.user.id}&select=highlighted_text`, {
          headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        const items = await response.json();
        sendResponse(items);
      } catch (error) {
        sendResponse([]);
      }
    })();
    return true;
  }
}); 