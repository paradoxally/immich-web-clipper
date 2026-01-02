document.addEventListener('DOMContentLoaded', async () => {
  // Views
  const loginView = document.getElementById('login-view');
  const mainView = document.getElementById('main-view');
  const settingsView = document.getElementById('settings-view');

  // Login elements
  const loginForm = document.getElementById('login-form');
  const serverUrlInput = document.getElementById('server-url');
  const apiKeyInput = document.getElementById('api-key');
  const connectBtn = document.getElementById('connect-btn');
  const loginNotification = document.getElementById('login-notification');

  // Main view elements
  const settingsBtn = document.getElementById('settings-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const serverNameEl = document.getElementById('server-name');
  const statImagesEl = document.getElementById('stat-images');
  const statSizeEl = document.getElementById('stat-size');
  const currentAlbumNameEl = document.getElementById('current-album-name');

  // Settings elements
  const backBtn = document.getElementById('back-btn');
  const albumSelect = document.getElementById('album-select');
  const refreshAlbumsBtn = document.getElementById('refresh-albums');
  const alertsToggle = document.getElementById('setting-alerts');
  const askAlbumToggle = document.getElementById('setting-ask-album');

  // Reset stats elements
  const resetStatsBtn = document.getElementById('reset-stats-btn');
  const resetConfirm = document.getElementById('reset-confirm');
  const resetYesBtn = document.getElementById('reset-yes');
  const resetNoBtn = document.getElementById('reset-no');

  // Theme toggles
  const themeToggles = [
    document.getElementById('theme-toggle-login'),
    document.getElementById('theme-toggle-main')
  ];

  // Load settings
  const settings = await chrome.storage.sync.get([
    'serverUrl', 'apiKey', 'defaultAlbumId', 'defaultAlbumName',
    'theme', 'showAlerts', 'askAlbumEveryTime', 'stats'
  ]);

  // Apply theme
  const theme = settings.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  // Initialize settings toggles
  alertsToggle.checked = settings.showAlerts !== false; // default true
  askAlbumToggle.checked = settings.askAlbumEveryTime === true; // default false

  // Check if connected
  if (settings.serverUrl && settings.apiKey) {
    showView('main');
    await loadMainView(settings);
  } else {
    showView('login');
    if (settings.serverUrl) serverUrlInput.value = settings.serverUrl;
    if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  }

  // View switching
  function showView(view) {
    loginView.classList.toggle('hidden', view !== 'login');
    mainView.classList.toggle('hidden', view !== 'main');
    settingsView.classList.toggle('hidden', view !== 'settings');
  }

  // Theme toggle
  themeToggles.forEach(btn => {
    btn?.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      await chrome.storage.sync.set({ theme: next });
    });
  });

  // Login form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const serverUrl = normalizeUrl(serverUrlInput.value);
    const apiKey = apiKeyInput.value.trim();

    if (!serverUrl || !apiKey) return;

    setLoading(connectBtn, true);
    hideNotification();

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'testConnection',
        serverUrl,
        apiKey
      });

      if (result.success) {
        await chrome.storage.sync.set({ serverUrl, apiKey });
        const newSettings = await chrome.storage.sync.get([
          'serverUrl', 'apiKey', 'defaultAlbumId', 'defaultAlbumName', 'stats'
        ]);
        showView('main');
        await loadMainView(newSettings);
      } else {
        showNotification(`Connection failed: ${result.error}`);
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`);
    } finally {
      setLoading(connectBtn, false);
    }
  });

  // Clear error when user types
  serverUrlInput.addEventListener('input', hideNotification);
  apiKeyInput.addEventListener('input', hideNotification);

  // Load main view data
  async function loadMainView(settings) {
    // Server name from URL - lowercase
    try {
      const url = new URL(settings.serverUrl);
      serverNameEl.textContent = url.hostname;
    } catch {
      serverNameEl.textContent = 'Connected';
    }

    // Stats
    const stats = settings.stats || { imageCount: 0, totalSize: 0 };
    statImagesEl.textContent = stats.imageCount.toLocaleString();
    statSizeEl.textContent = formatBytes(stats.totalSize);

    // Current album - check if ask every time is enabled
    const askEveryTime = settings.askAlbumEveryTime === true;
    if (askEveryTime) {
      currentAlbumNameEl.textContent = 'Ask every time';
    } else {
      currentAlbumNameEl.textContent = settings.defaultAlbumName || 'Library';
    }

    // Load albums for settings
    await loadAlbums(settings.serverUrl, settings.apiKey, settings.defaultAlbumId);
  }

  // Settings button
  settingsBtn.addEventListener('click', () => showView('settings'));

  // Back button
  backBtn.addEventListener('click', async () => {
    showView('main');
    const settings = await chrome.storage.sync.get(['defaultAlbumName', 'askAlbumEveryTime']);
    if (settings.askAlbumEveryTime) {
      currentAlbumNameEl.textContent = 'Ask every time';
    } else {
      currentAlbumNameEl.textContent = settings.defaultAlbumName || 'Library';
    }
  });

  // Disconnect
  disconnectBtn.addEventListener('click', async () => {
    await chrome.storage.sync.remove(['serverUrl', 'apiKey']);
    serverUrlInput.value = '';
    apiKeyInput.value = '';
    showView('login');
  });

  // Album select
  albumSelect.addEventListener('change', async () => {
    const albumId = albumSelect.value;
    const albumName = albumSelect.options[albumSelect.selectedIndex]?.text || '';
    
    await chrome.storage.sync.set({
      defaultAlbumId: albumId || null,
      defaultAlbumName: albumId ? albumName : null
    });
  });

  // Refresh albums
  refreshAlbumsBtn.addEventListener('click', async () => {
    const settings = await chrome.storage.sync.get(['serverUrl', 'apiKey', 'defaultAlbumId']);
    if (settings.serverUrl && settings.apiKey) {
      await loadAlbums(settings.serverUrl, settings.apiKey, settings.defaultAlbumId);
    }
  });

  // Settings toggles
  alertsToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ showAlerts: alertsToggle.checked });
  });

  askAlbumToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ askAlbumEveryTime: askAlbumToggle.checked });
  });

  // Reset stats
  resetStatsBtn.addEventListener('click', () => {
    resetStatsBtn.classList.add('hidden');
    resetConfirm.classList.remove('hidden');
  });

  resetYesBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set({ stats: { imageCount: 0, totalSize: 0 } });
    statImagesEl.textContent = '0';
    statSizeEl.textContent = '0 B';
    resetConfirm.classList.add('hidden');
    resetStatsBtn.classList.remove('hidden');
  });

  resetNoBtn.addEventListener('click', () => {
    resetConfirm.classList.add('hidden');
    resetStatsBtn.classList.remove('hidden');
  });

  // Load albums
  async function loadAlbums(serverUrl, apiKey, preselectAlbumId = null) {
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'getAlbums',
        serverUrl,
        apiKey
      });

      if (result.success) {
        // Clear existing options except first
        while (albumSelect.options.length > 1) {
          albumSelect.remove(1);
        }

        const albums = result.albums.sort((a, b) => 
          a.albumName.localeCompare(b.albumName)
        );

        const albumExists = preselectAlbumId && albums.some(a => a.id === preselectAlbumId);

        albums.forEach(album => {
          const option = document.createElement('option');
          option.value = album.id;
          option.textContent = album.albumName;
          albumSelect.appendChild(option);
        });

        if (albumExists) {
          albumSelect.value = preselectAlbumId;
        } else if (preselectAlbumId) {
          // Album was deleted
          await chrome.storage.sync.set({
            defaultAlbumId: null,
            defaultAlbumName: null
          });
        }
      }
    } catch (error) {
      console.error('Failed to load albums:', error);
    }
  }

  // Helpers
  function normalizeUrl(url) {
    let normalized = url.trim();
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  }

  function showNotification(message) {
    loginNotification.textContent = message;
    loginNotification.classList.remove('hidden');
  }

  function hideNotification() {
    loginNotification.classList.add('hidden');
  }

  function setLoading(button, loading) {
    button.disabled = loading;
    button.classList.toggle('loading', loading);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
});
