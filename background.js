// Background service worker for Immich Web Clipper extension

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-immich",
    title: "Save to Immich",
    contexts: ["image"]
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-to-immich") {
    const imageUrl = info.srcUrl;
    const tabId = tab?.id;
    
    const settings = await chrome.storage.sync.get([
      'serverUrl', 'apiKey', 'defaultAlbumId', 'defaultAlbumName',
      'showAlerts', 'askAlbumEveryTime'
    ]);
    
    if (!settings.serverUrl || !settings.apiKey) {
      notifyUser("Configure Immich in extension settings", "error", tabId, settings);
      return;
    }

    // If ask every time is enabled, show album picker
    if (settings.askAlbumEveryTime) {
      try {
        const albums = await getAlbums(settings.serverUrl, settings.apiKey);
        showAlbumPicker(tabId, imageUrl, albums, settings);
      } catch (error) {
        notifyUser(`Error: ${error.message}`, "error", tabId, settings);
      }
      return;
    }
    
    // Otherwise save directly
    await saveImage(imageUrl, settings.defaultAlbumId, settings.defaultAlbumName, tabId, settings);
  }
});

async function saveImage(imageUrl, albumId, albumName, tabId, settings) {
  try {
    notifyUser("Saving…", "info", tabId, settings);
    
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    
    const imageBlob = await imageResponse.blob();
    const imageSize = imageBlob.size;
    
    let filename = imageUrl.split('/').pop()?.split('?')[0] || `image_${Date.now()}`;
    if (!filename.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
      const ext = imageBlob.type.split('/')[1] || 'jpg';
      filename += `.${ext}`;
    }
    
    const uploadResult = await uploadToImmich(settings.serverUrl, settings.apiKey, imageBlob, filename);
    
    if (albumId) {
      await addToAlbum(settings.serverUrl, settings.apiKey, albumId, uploadResult.id);
    }

    // Only update stats if this is a new image, not a duplicate
    if (!uploadResult.isDuplicate) {
      const stored = await chrome.storage.sync.get(['stats']);
      const stats = stored.stats || { imageCount: 0, totalSize: 0 };
      stats.imageCount += 1;
      stats.totalSize += imageSize;
      await chrome.storage.sync.set({ stats });
      
      notifyUser(albumId ? `Saved to ${albumName}` : "Saved to Immich", "success", tabId, settings);
    } else {
      // Notify user this was a duplicate
      notifyUser("Already in library", "info", tabId, settings);
    }
    
  } catch (error) {
    console.error("Error saving to Immich:", error);
    notifyUser(`${error.message}`, "error", tabId, settings);
  }
}

async function uploadToImmich(serverUrl, apiKey, imageBlob, filename) {
  const formData = new FormData();
  formData.append('assetData', imageBlob, filename);
  formData.append('deviceAssetId', `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  formData.append('deviceId', 'immich-browser-extension');
  formData.append('fileCreatedAt', new Date().toISOString());
  formData.append('fileModifiedAt', new Date().toISOString());
  
  const response = await fetch(`${serverUrl}/api/assets`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status}`);
  }
  
  const result = await response.json();
  // Return both id and status - status can be "created" or "duplicate"
  return { 
    id: result.id, 
    status: result.status || 'created',
    isDuplicate: result.status === 'duplicate'
  };
}

async function addToAlbum(serverUrl, apiKey, albumId, assetId) {
  const response = await fetch(`${serverUrl}/api/albums/${albumId}/assets`, {
    method: 'PUT',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ids: [assetId] })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to add to album: ${response.status}`);
  }
  
  return response.json();
}

async function notifyUser(message, type, tabId, settings) {
  // Check if alerts are disabled (except for errors which always show)
  if (settings?.showAlerts === false && type !== 'error') {
    return;
  }
  
  if (!tabId) return;
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showToast,
      args: [message, type]
    });
  } catch (e) {
    console.log('Could not show toast:', e);
  }
}

function showToast(message, type) {
  const isError = type === 'error';
  const isLoading = type === 'info';
  
  let toast = document.getElementById('immich-toast');
  let inner = document.getElementById('immich-toast-inner');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'immich-toast';
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes immich-slide-in {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes immich-fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes immich-spin {
        to { transform: rotate(360deg); }
      }
    `;
    toast.appendChild(style);
    
    inner = document.createElement('div');
    inner.id = 'immich-toast-inner';
    toast.appendChild(inner);
    
    document.body.appendChild(toast);
  }
  
  const iconColor = isError ? '#f87171' : isLoading ? '#a1a1aa' : '#4ade80';
  const icon = isLoading ? `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="animation: immich-spin 0.8s linear infinite; flex-shrink: 0;">
      <circle cx="12" cy="12" r="10" stroke="#71717a" stroke-width="3" fill="none"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#a1a1aa" stroke-width="3" stroke-linecap="round" fill="none"/>
    </svg>
  ` : isError ? `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;">
      <circle cx="12" cy="12" r="10" stroke="${iconColor}" stroke-width="2"/>
      <path d="M15 9l-6 6M9 9l6 6" stroke="${iconColor}" stroke-width="2" stroke-linecap="round"/>
    </svg>
  ` : `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;">
      <circle cx="12" cy="12" r="10" stroke="${iconColor}" stroke-width="2"/>
      <path d="M8 12l3 3 5-6" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  
  inner.innerHTML = `${icon}<span>${message}</span>`;
  
  Object.assign(inner.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    background: isError ? '#1f1315' : '#18181b',
    border: `1px solid ${isError ? '#7f1d1d' : '#3f3f46'}`,
    borderRadius: '10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: '13px',
    color: isError ? '#fca5a5' : '#e4e4e7',
    pointerEvents: 'none',
    transition: 'all 0.15s ease-out'
  });
  
  if (!toast.dataset.shown) {
    inner.style.animation = 'immich-slide-in 0.2s ease-out';
    toast.dataset.shown = 'true';
  }
  
  if (window._immichToastTimeout) {
    clearTimeout(window._immichToastTimeout);
  }
  
  if (!isLoading) {
    window._immichToastTimeout = setTimeout(() => {
      const el = document.getElementById('immich-toast-inner');
      if (el) {
        el.style.animation = 'immich-fade-out 0.15s ease-in forwards';
        setTimeout(() => {
          const toast = document.getElementById('immich-toast');
          if (toast) toast.remove();
        }, 150);
      }
    }, isError ? 3000 : 1200);
  }
}

async function showAlbumPicker(tabId, imageUrl, albums, settings) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectAlbumPicker,
      args: [albums, settings.defaultAlbumId]
    });

    // Listen for album selection
    chrome.runtime.onMessage.addListener(function handler(request, sender) {
      if (request.action === 'albumSelected' && sender.tab?.id === tabId) {
        chrome.runtime.onMessage.removeListener(handler);
        saveImage(imageUrl, request.albumId, request.albumName, tabId, settings);
      } else if (request.action === 'albumPickerCancelled' && sender.tab?.id === tabId) {
        chrome.runtime.onMessage.removeListener(handler);
      }
    });
  } catch (e) {
    console.log('Could not show album picker:', e);
  }
}

function injectAlbumPicker(albums, defaultAlbumId) {
  // Remove existing picker (including old versions)
  document.querySelectorAll('[id^="immich-album-picker"]').forEach(el => el.remove());

  const picker = document.createElement('div');
  picker.id = 'immich-album-picker-v2';
  picker.innerHTML = `
    <style>
      @keyframes immich-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes immich-scale-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      #immich-album-picker-v2-overlay {
        position: fixed !important;
        inset: 0 !important;
        background: rgba(0,0,0,0.4) !important;
        z-index: 2147483646 !important;
        animation: immich-fade-in 0.15s ease-out !important;
        cursor: default !important;
      }
      #immich-album-picker-v2-container {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        z-index: 2147483647 !important;
        padding: 14px 18px !important;
        background: #18181b !important;
        border: 1px solid #3f3f46 !important;
        border-radius: 10px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        animation: immich-scale-in 0.15s ease-out !important;
        min-width: 220px !important;
        cursor: default !important;
      }
      #immich-album-picker-v2-container .picker-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        margin-bottom: 20px !important;
      }
      #immich-album-picker-v2-container .picker-title {
        font-size: 13px !important;
        font-weight: 500 !important;
        color: #e4e4e7 !important;
      }
      #immich-album-picker-v2-container .picker-close {
        background: none !important;
        border: none !important;
        color: #71717a !important;
        cursor: pointer !important;
        padding: 2px !important;
        display: flex !important;
      }
      #immich-album-picker-v2-container .picker-close:hover {
        color: #e4e4e7 !important;
      }
      #immich-album-picker-v2-container select {
        width: 100% !important;
        padding: 10px 12px !important;
        border: 1px solid #3f3f46 !important;
        border-radius: 8px !important;
        background: #27272a !important;
        color: #e4e4e7 !important;
        font-size: 13px !important;
        margin-bottom: 12px !important;
        cursor: pointer !important;
        -webkit-appearance: none !important;
        appearance: none !important;
        background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") !important;
        background-repeat: no-repeat !important;
        background-position: right 10px center !important;
        padding-right: 32px !important;
      }
      #immich-album-picker-v2-container select:focus {
        outline: none !important;
        border-color: #6366f1 !important;
      }
      #immich-album-picker-v2-container .picker-btn {
        width: 100% !important;
        padding: 10px !important;
        border-radius: 8px !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        border: none !important;
        background: #6366f1 !important;
        color: white !important;
      }
      #immich-album-picker-v2-container .picker-btn:hover {
        background: #818cf8 !important;
      }
      #immich-album-picker-v2-overlay,
      #immich-album-picker-v2-overlay *,
      #immich-album-picker-v2-container,
      #immich-album-picker-v2-container *,
      #immich-album-picker-v2-container select,
      #immich-album-picker-v2-container option {
        cursor: default !important;
      }
      #immich-album-picker-v2-container .picker-close,
      #immich-album-picker-v2-container .picker-btn,
      #immich-album-picker-v2-container select {
        cursor: pointer !important;
      }
    </style>
    <div id="immich-album-picker-v2-overlay" style="cursor:default!important"></div>
    <div id="immich-album-picker-v2-container" style="cursor:default!important">
      <div class="picker-header" style="cursor:default!important">
        <span class="picker-title" style="cursor:default!important">Choose album</span>
        <button class="picker-close" id="immich-picker-v2-close" style="cursor:pointer!important">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="cursor:pointer!important">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <select id="immich-album-v2-select" style="cursor:pointer!important">
        <option value="">Library (no album)</option>
        ${albums.sort((a, b) => a.albumName.localeCompare(b.albumName))
          .map(a => `<option value="${a.id}" ${a.id === defaultAlbumId ? 'selected' : ''}>${a.albumName}</option>`)
          .join('')}
      </select>
      <button class="picker-btn" id="immich-picker-v2-save" style="cursor:pointer!important">Save</button>
    </div>
  `;

  document.body.appendChild(picker);

  // Force cursor styles via JavaScript to override any page styles
  const container = document.getElementById('immich-album-picker-v2-container');
  const overlayEl = document.getElementById('immich-album-picker-v2-overlay');
  
  // Apply to all elements
  [overlayEl, container].forEach(el => {
    if (el) {
      el.style.setProperty('cursor', 'default', 'important');
      el.style.setProperty('pointer-events', 'auto', 'important');
    }
  });
  
  // Apply to container and all descendants
  if (container) {
    container.querySelectorAll('*').forEach(el => {
      el.style.setProperty('cursor', 'default', 'important');
      el.style.setProperty('pointer-events', 'auto', 'important');
    });
  }
  
  // Set pointer cursor for interactive elements
  const selectEl = document.getElementById('immich-album-v2-select');
  const closeBtnEl = document.getElementById('immich-picker-v2-close');
  const saveBtnEl = document.getElementById('immich-picker-v2-save');
  
  [selectEl, closeBtnEl, saveBtnEl].forEach(el => {
    if (el) {
      el.style.setProperty('cursor', 'pointer', 'important');
    }
  });

  const overlay = document.getElementById('immich-album-picker-v2-overlay');
  const closeBtn = document.getElementById('immich-picker-v2-close');
  const saveBtn = document.getElementById('immich-picker-v2-save');
  const select = document.getElementById('immich-album-v2-select');

  function close() {
    picker.remove();
  }

  overlay.addEventListener('click', () => {
    close();
    chrome.runtime.sendMessage({ action: 'albumPickerCancelled' });
  });

  closeBtn.addEventListener('click', () => {
    close();
    chrome.runtime.sendMessage({ action: 'albumPickerCancelled' });
  });

  saveBtn.addEventListener('click', () => {
    const albumId = select.value;
    const albumName = select.options[select.selectedIndex]?.text || '';
    close();
    chrome.runtime.sendMessage({ 
      action: 'albumSelected', 
      albumId: albumId || null,
      albumName: albumId ? albumName : null
    });
  });
}

async function getAlbums(serverUrl, apiKey) {
  const response = await fetch(`${serverUrl}/api/albums`, {
    headers: { 'x-api-key': apiKey }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch albums: ${response.status}`);
  }
  
  return response.json();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'testConnection') {
    testConnection(request.serverUrl, request.apiKey)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'getAlbums') {
    getAlbums(request.serverUrl, request.apiKey)
      .then(albums => sendResponse({ success: true, albums }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function testConnection(serverUrl, apiKey) {
  const response = await fetch(`${serverUrl}/api/server/about`, {
    headers: { 'x-api-key': apiKey }
  });
  
  if (!response.ok) {
    throw new Error(`Connection failed: ${response.status}`);
  }
  
  const data = await response.json();
  return { success: true, version: data.version };
}
