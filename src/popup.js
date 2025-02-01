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

  // Add user_id to the data before saving
  const dataWithUser = {
    ...data,
    user_id: session.session.user.id // Add user_id from session
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
    const errorText = await response.text();
    throw new Error(`Failed to save: ${response.status} ${errorText}`);
  }

  return response.json();
}

// Function to get the main image from the webpage
async function getMainImage(tabId) {
  const [{ result: imageData }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Helper function to validate URL
      const isValidUrl = (url) => {
        try {
          new URL(url);
          return url.startsWith('http') || url.startsWith('https');
        } catch {
          return false;
        }
      };

      // Get all possible meta tag images
      const metaTags = {
        'og:image': document.querySelector('meta[property="og:image"]')?.content,
        'og:image:secure_url': document.querySelector('meta[property="og:image:secure_url"]')?.content,
        'twitter:image': document.querySelector('meta[name="twitter:image"]')?.content,
        'twitter:image:src': document.querySelector('meta[name="twitter:image:src"]')?.content,
        'article:image': document.querySelector('meta[property="article:image"]')?.content,
      };

      // Get all image elements
      const images = Array.from(document.getElementsByTagName('img'))
        .map(img => ({
          src: img.src,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          area: (img.naturalWidth || img.width) * (img.naturalHeight || img.height)
        }))
        .filter(img => {
          return img.width > 100 && 
                 img.height > 100 && 
                 isValidUrl(img.src) && 
                 !img.src.includes('icon') &&
                 !img.src.includes('logo') &&
                 !img.src.startsWith('data:');
        })
        .sort((a, b) => b.area - a.area);

      // Find the first valid image URL
      let finalImageUrl = '';
      
      // First try meta tags
      for (const [key, value] of Object.entries(metaTags)) {
        if (value && isValidUrl(value)) {
          finalImageUrl = value;
          break;
        }
      }

      // If no meta tag image, use the largest valid image
      if (!finalImageUrl && images.length > 0) {
        finalImageUrl = images[0].src;
      }

      return finalImageUrl || '';
    }
  });

  return imageData;
}

// Function to get page summary
async function getPageSummary(tabId) {
  const [{ result: summaryData }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Try to get meta description first
      const metaDescription = document.querySelector('meta[name="description"]')?.content
        || document.querySelector('meta[property="og:description"]')?.content
        || document.querySelector('meta[name="twitter:description"]')?.content;

      if (metaDescription) {
        return metaDescription;
      }

      // If no meta description, create a brief summary from the content
      const mainContent = document.body.innerText;
      // Get first 250 characters of actual content, stopping at the last complete word
      const briefSummary = mainContent
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim()
        .substring(0, 250) // Get first 250 characters
        .replace(/\s\S*$/, ''); // Remove partial word at the end

      return briefSummary + '...';
    }
  });

  return summaryData;
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
    saveButton.addEventListener('click', async function() {
      setLoading(true);
      showMessage('');
      console.log('Save button clicked');

      try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ 
          active: true, 
          currentWindow: true 
        });

        // Get main image URL
        const mainImageUrl = await getMainImage(tab.id);
        console.log('Found main image URL:', mainImageUrl);

        // Get selected text
        const [{ result: selection }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString() || ''
        });

        // Get page summary
        const pageSummary = await getPageSummary(tab.id);

        // Prepare data with the correct field mapping
        const data = {
          type: selection ? 'highlight' : 'link',
          title: tab.title,
          url: tab.url,
          summary: pageSummary, // Use the brief summary instead of full content
          content: '', // Leave content field empty
          tags: tagsInput?.value ? tagsInput.value.split(',').map(t => t.trim()).filter(Boolean) : [],
          created_at: new Date().toISOString(),
          image_url: mainImageUrl,
          highlighted_text: selection || '' // Save selection to highlighted_text if it exists
        };

        console.log('Data being saved to Supabase:', JSON.stringify(data, null, 2));

        await saveToSupabase(data);
        showMessage('Saved successfully!');
        if (tagsInput) {
          tagsInput.value = '';
        }
      } catch (error) {
        console.error('Save error:', error);
        showMessage(error.message || 'Failed to save', true);
      } finally {
        setLoading(false);
      }
    });
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
