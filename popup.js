document.addEventListener('DOMContentLoaded', async () => {
  const loginView = document.getElementById('login-view');
  const mainView = document.getElementById('main-view');
  const settingsView = document.getElementById('settings-view');

  const loginForm = document.getElementById('login-form');
  const serverUrlInput = document.getElementById('server-url');
  const apiKeyInput = document.getElementById('api-key');
  const connectBtn = document.getElementById('connect-btn');
  const loginNotification = document.getElementById('login-notification');

  const settingsBtn = document.getElementById('settings-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const serverNameEl = document.getElementById('server-name');
  const statImagesEl = document.getElementById('stat-images');
  const statSizeEl = document.getElementById('stat-size');
  const currentAlbumNameEl = document.getElementById('current-album-name');

  const backBtn = document.getElementById('back-btn');
  const albumSelect = document.getElementById('album-select');
  const refreshAlbumsBtn = document.getElementById('refresh-albums');
  const alertsToggle = document.getElementById('setting-alerts');
  const askAlbumToggle = document.getElementById('setting-ask-album');

  const resetStatsBtn = document.getElementById('reset-stats-btn');

  const versionNumberEl = document.getElementById('version-number');

  const footerGithubLink = document.getElementById('footer-github');
  const footerPrivacyLink = document.getElementById('footer-privacy');
  const footerBugLink = document.getElementById('footer-bug');
  const resetConfirm = document.getElementById('reset-confirm');
  const resetYesBtn = document.getElementById('reset-yes');
  const resetNoBtn = document.getElementById('reset-no');

  const themeToggles = [
    document.getElementById('theme-toggle-login'),
    document.getElementById('theme-toggle-main')
  ];

  const settings = await chrome.storage.sync.get([
    'serverUrl', 'apiKey', 'defaultAlbumId', 'defaultAlbumName',
    'theme', 'showAlerts', 'askAlbumEveryTime', 'stats'
  ]);

  const theme = settings.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  const manifest = chrome.runtime.getManifest();
  versionNumberEl.textContent = `v${manifest.version}`;

  const repoUrl = manifest.homepage_url || 'https://github.com/paradoxally/immich-web-clipper';
  footerGithubLink.href = repoUrl;
  footerPrivacyLink.href = `${repoUrl}/blob/main/PRIVACY.md`;
  footerBugLink.href = `${repoUrl}/issues`;

  alertsToggle.checked = settings.showAlerts !== false;
  askAlbumToggle.checked = settings.askAlbumEveryTime === true;

  if (settings.serverUrl && settings.apiKey) {
    showView('main');
    await loadMainView(settings);
  } else {
    showView('login');

    // Load draft values from local storage (temporary inputs)
    const draft = await chrome.storage.local.get(['draftServerUrl', 'draftApiKey']);
    if (draft.draftServerUrl) serverUrlInput.value = draft.draftServerUrl;
    if (draft.draftApiKey) apiKeyInput.value = draft.draftApiKey;

    // Fall back to saved values if no drafts
    if (!draft.draftServerUrl && settings.serverUrl) serverUrlInput.value = settings.serverUrl;
    if (!draft.draftApiKey && settings.apiKey) apiKeyInput.value = settings.apiKey;
  }

  function showView(view) {
    loginView.classList.toggle('hidden', view !== 'login');
    mainView.classList.toggle('hidden', view !== 'main');
    settingsView.classList.toggle('hidden', view !== 'settings');
  }

  themeToggles.forEach(btn => {
    btn?.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      await chrome.storage.sync.set({ theme: next });
    });
  });

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
        // Clear draft values after successful connection
        await chrome.storage.local.remove(['draftServerUrl', 'draftApiKey']);
        const newSettings = await chrome.storage.sync.get([
          'serverUrl', 'apiKey', 'defaultAlbumId', 'defaultAlbumName', 'stats'
        ]);
        showView('main');
        await loadMainView(newSettings);
      } else {
        showNotification(result.error);
      }
    } catch (error) {
      showNotification(error.message);
    } finally {
      setLoading(connectBtn, false);
    }
  });

  // Auto-save draft inputs and clear errors when user types
  serverUrlInput.addEventListener('input', () => {
    hideNotification();
    chrome.storage.local.set({ draftServerUrl: serverUrlInput.value });
  });

  apiKeyInput.addEventListener('input', () => {
    hideNotification();
    chrome.storage.local.set({ draftApiKey: apiKeyInput.value });
  });

  async function loadMainView(settings) {
    try {
      const url = new URL(settings.serverUrl);
      serverNameEl.textContent = url.hostname;
    } catch {
      serverNameEl.textContent = 'Connected';
    }

    const stats = settings.stats || { imageCount: 0, totalSize: 0 };
    statImagesEl.textContent = stats.imageCount.toLocaleString();
    statSizeEl.textContent = formatBytes(stats.totalSize);

    const askEveryTime = settings.askAlbumEveryTime === true;
    if (askEveryTime) {
      currentAlbumNameEl.textContent = 'Ask every time';
    } else {
      currentAlbumNameEl.textContent = settings.defaultAlbumName || 'Library';
    }

    await loadAlbums(settings.serverUrl, settings.apiKey, settings.defaultAlbumId);
  }

  settingsBtn.addEventListener('click', () => showView('settings'));

  backBtn.addEventListener('click', async () => {
    showView('main');
    const settings = await chrome.storage.sync.get(['defaultAlbumName', 'askAlbumEveryTime']);
    if (settings.askAlbumEveryTime) {
      currentAlbumNameEl.textContent = 'Ask every time';
    } else {
      currentAlbumNameEl.textContent = settings.defaultAlbumName || 'Library';
    }
  });

  disconnectBtn.addEventListener('click', async () => {
    await chrome.storage.sync.remove(['serverUrl', 'apiKey']);
    serverUrlInput.value = '';
    apiKeyInput.value = '';
    showView('login');
  });

  albumSelect.addEventListener('change', async () => {
    const albumId = albumSelect.value;
    const albumName = albumSelect.options[albumSelect.selectedIndex]?.text || '';

    await chrome.storage.sync.set({
      defaultAlbumId: albumId || null,
      defaultAlbumName: albumId ? albumName : null
    });
  });

  refreshAlbumsBtn.addEventListener('click', async () => {
    const settings = await chrome.storage.sync.get(['serverUrl', 'apiKey', 'defaultAlbumId']);
    if (settings.serverUrl && settings.apiKey) {
      await loadAlbums(settings.serverUrl, settings.apiKey, settings.defaultAlbumId);
    }
  });

  alertsToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ showAlerts: alertsToggle.checked });
  });

  askAlbumToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ askAlbumEveryTime: askAlbumToggle.checked });
  });

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
