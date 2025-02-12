import { API_URL } from './config.js';

// Constants
const PROJECT_ID = 'izcbuvdlbiifmalkdghs';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6Y2J1dmRsYmlpZm1hbGtkZ2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyMzE3NjEsImV4cCI6MjA1MzgwNzc2MX0.kqGZg5jK2armE2rM2KkKKUubfqZjUL7vXAP46ZJeTlI'
const BASE_URL = `https://${PROJECT_ID}.supabase.co`;



// UI Elements
const loginForm = document.getElementById('loginForm');
const mainContent = document.getElementById('mainContent');
const loginButton = document.getElementById('login');
const saveButton = document.getElementById('save');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginMessage = document.getElementById('loginMessage');
const tagsInput = document.getElementById('tags');
const messageElement = document.getElementById('message');
const logoutButton = document.getElementById('logoutButton');

// Check authentication status on popup open
async function checkAuth() {
  const session = await chrome.storage.local.get('session');
  if (session.session) {
    showMainContent();
  } else {
    showLoginForm();
  }
}

// Show/hide UI elements
function showLoginForm() {
  loginForm.style.display = 'block';
  mainContent.style.display = 'none';
  logoutButton.style.display = 'none';
}

function showMainContent() {
  loginForm.style.display = 'none';
  mainContent.style.display = 'block';
  logoutButton.style.display = 'flex';
}

// Login handler
async function handleLogin() {
  const email = emailInput.value;
  const password = passwordInput.value;

  if (!email || !password) {
    showLoginMessage('Please enter both email and password', true);
    return;
  }

  try {
    const response = await fetch(`${BASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Save session
      await chrome.storage.local.set({ session: data });
      showMainContent();
    } else {
      showLoginMessage(data.error_description || 'Login failed', true);
    }
  } catch (error) {
    console.error('Login error:', error);
    showLoginMessage('Login failed', true);
  }
}

// Helper functions
function showLoginMessage(message, isError = false) {
  if (loginMessage) {
    loginMessage.textContent = message;
    loginMessage.style.color = isError ? 'red' : 'green';
  }
}

function showMessage(message, isError = false) {
  if (messageElement) {
    messageElement.textContent = message;
    messageElement.style.color = isError ? 'red' : 'green';
  }
}

function setLoading(isLoading) {
  if (saveButton) {
    saveButton.disabled = isLoading;
    saveButton.textContent = isLoading ? 'Saving...' : 'Save Page';
  }
}

// Save to Supabase function
async function saveToSupabase(data) {
  const session = await chrome.storage.local.get('session');
  if (!session.session) {
    throw new Error('Not authenticated');
  }

  console.log('Session:', session.session);
  console.log('Data to save:', data);

  // Use the full URL directly
  const apiUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api/items'
    : 'https://stashit-nine.vercel.app/api/items';

  console.log('Sending request to:', apiUrl);

  try {
    // First try to save directly to the API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${session.session.access_token}`
      },
      body: JSON.stringify({
        ...data,
        user_id: session.session.user.id
      })
    });

    const responseText = await response.text();
    console.log('Response status:', response.status);
    console.log('Response text:', responseText);

    if (!response.ok) {
      // If API fails, try saving directly to Supabase as fallback
      console.log('API save failed, trying direct Supabase save');
      const supabaseResponse = await fetch(`${BASE_URL}/rest/v1/stashed_items`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          ...data,
          user_id: session.session.user.id,
          needs_scraping: true
        })
      });

      if (!supabaseResponse.ok) {
        const supabaseError = await supabaseResponse.text();
        throw new Error(`Failed to save to Supabase: ${supabaseResponse.status} ${supabaseError}`);
      }

      return { success: true, message: 'Saved directly to Supabase' };
    }

    return responseText ? JSON.parse(responseText) : { success: true };
  } catch (error) {
    console.error('Save error:', error);
    throw error;
  }
}

// Add logout handler function
async function handleLogout() {
  try {
    // Clear session from storage
    await chrome.storage.local.remove('session');
    // Show login form
    showLoginForm();
    // Clear any existing messages
    showMessage('');
    // Clear tags input
    if (tagsInput) {
      tagsInput.value = '';
    }
  } catch (error) {
    console.error('Logout error:', error);
    showMessage('Failed to logout', true);
  }
}

// Add these functions back
async function getMainImage(tabId) {
  const [{ result: imageData }] = await chrome.scripting.executeScript({
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

      // Get meta images first
      const metaTags = {
        'og:image': document.querySelector('meta[property="og:image"]')?.content,
        'og:image:secure_url': document.querySelector('meta[property="og:image:secure_url"]')?.content,
        'twitter:image': document.querySelector('meta[name="twitter:image"]')?.content,
        'twitter:image:src': document.querySelector('meta[name="twitter:image:src"]')?.content,
      };

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
  return imageData;
}

async function getPageSummary(tabId) {
  const [{ result: summaryData }] = await chrome.scripting.executeScript({
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
  return summaryData;
}

// Add this function at the top of popup.js
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Then modify your save function to use it:
async function handleSave() {
  try {
    setLoading(true);
    showMessage('');

    // Check authentication first
    const session = await chrome.storage.local.get('session');
    if (!session.session) {
      throw new Error('Not authenticated');
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Get image URL and description with YouTube handling
    const [imageResult, summaryResult] = await Promise.all([
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Special handling for YouTube
          if (window.location.hostname.includes('youtube.com')) {
            // Try to get video thumbnail
            const videoId = new URLSearchParams(window.location.search).get('v');
            if (videoId) {
              return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
            }
          }
          
          // Regular image detection for other sites
          let maxImage = '';
          let maxSize = 0;
          
          // First check meta images
          const ogImage = document.querySelector('meta[property="og:image"]')?.content;
          if (ogImage && !ogImage.includes('logo')) return ogImage;
          
          const twitterImage = document.querySelector('meta[name="twitter:image"]')?.content;
          if (twitterImage && !twitterImage.includes('logo')) return twitterImage;
          
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
      }),
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Special handling for YouTube description
          if (window.location.hostname.includes('youtube.com')) {
            // Try to get video description from various possible selectors
            const description = 
              // New YouTube layout selectors
              document.querySelector('ytd-watch-metadata #description-inline-expander .ytd-expanded-metadata-renderer')?.textContent ||
              document.querySelector('ytd-watch-metadata #description-inline-expander')?.textContent ||
              // Older YouTube layout selectors
              document.querySelector('ytd-expander#description yt-formatted-string')?.textContent ||
              document.querySelector('#description .content')?.textContent ||
              // Fallback to meta description only if it's not the default YouTube description
              (() => {
                const metaDesc = document.querySelector('meta[name="description"]')?.content;
                return metaDesc?.includes('Enjoy the videos and music you love') ? null : metaDesc;
              })();
            
            if (description) {
              // Clean up the description
              return description
                .trim()
                .replace(/\n\n+/g, '\n') // Remove extra newlines
                .substring(0, 500) + (description.length > 500 ? '...' : '');
            }
          }
          
          // Regular summary detection for other sites
          const metaDesc = document.querySelector('meta[name="description"]')?.content
            || document.querySelector('meta[property="og:description"]')?.content
            || document.querySelector('meta[name="twitter:description"]')?.content;
          
          if (metaDesc) return metaDesc;
          
          // Fallback to content extraction
          const getTextContent = (elem) => {
            if (!elem) return '';
            return elem.innerText
              .replace(/\s+/g, ' ')
              .trim()
              .substring(0, 250);
          };
          
          const articleText = getTextContent(document.querySelector('article'));
          if (articleText) return articleText + '...';
          
          const mainText = getTextContent(document.querySelector('main'));
          if (mainText) return mainText + '...';
          
          const bodyText = getTextContent(document.body);
          return bodyText ? bodyText + '...' : '';
        }
      })
    ]);

    // Rest of your save logic...
    const data = {
      type: 'link',
      title: tab.url.includes('youtube.com') 
        ? tab.title.replace(/^\([0-9]+\)\s*/, '') // Remove notification count prefix
        : tab.title,
      url: tab.url,
      tags: tagsInput?.value ? tagsInput.value.split(',').map(t => t.trim()).filter(Boolean) : [],
      user_id: session.session.user.id,
      image_url: imageResult[0]?.result || null,
      summary: summaryResult[0]?.result || null
    };

    console.log('Saving data:', data);
    await saveToSupabase(data);
    
    showMessage('Saved successfully!', 'success');
    if (tagsInput) tagsInput.value = '';
    setTimeout(() => window.close(), 1000);

  } catch (error) {
    console.error('Save error:', error);
    showMessage(error.message || 'Failed to save', 'error');
  } finally {
    setLoading(false);
  }
}

async function captureFullPage(tabId) {
  try {
    console.log('Starting screenshot capture for tab:', tabId);
    
    // Get the full page dimensions
    const [{ result: dimensions }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        width: Math.max(
          document.documentElement.clientWidth,
          document.body.clientWidth
        ),
        height: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        )
      })
    });
    
    console.log('Page dimensions:', dimensions);

    // Update tab zoom and scroll position
    await chrome.tabs.setZoom(tabId, 1.0);
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.scrollTo(0, 0)
    });

    // Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 80
    });

    // Create a temporary canvas to process the image
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Wait for image to load
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });

    // Set canvas dimensions
    canvas.width = img.width;
    canvas.height = img.height;

    // Draw and compress
    ctx.drawImage(img, 0, 0);
    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

    console.log('Screenshot captured and compressed');
    return compressedDataUrl;

  } catch (error) {
    console.error('Screenshot capture failed:', error);
    return null;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth status
  await checkAuth();

  // Add login handler
  if (loginButton) {
    loginButton.addEventListener('click', handleLogin);
  }

  // Test Supabase connection
  try {
    // Verify stashed_items table exists
    const tableResponse = await fetch(`${BASE_URL}/rest/v1/stashed_items?select=count`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!tableResponse.ok) {
      throw new Error('stashed_items table not found or not accessible');
    }

    console.log('Supabase connection successful');
  } catch (error) {
    console.error('Supabase connection error:', error);
    showMessage('Database Error: ' + error.message, true);
  }

  // Handle save button click
  if (saveButton) {
    saveButton.addEventListener('click', handleSave);
  }

  // Add Enter key support
  if (tagsInput) {
    tagsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && saveButton) {
        e.preventDefault();
        saveButton.click();
      }
    });
  }

  // Add logout handler
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }

  console.log('Popup script loaded');
});
