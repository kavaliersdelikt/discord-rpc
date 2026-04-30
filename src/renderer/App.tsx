import { useEffect, useMemo, useState } from 'react';
import './styles.css';

type PresetButton = { label: string; url: string };

type Preset = {
  id: string;
  name: string;
  details: string;
  state: string;
  largeImage: { path: string; preview: string; name: string } | null;
  smallImage: { path: string; preview: string; name: string } | null;
  buttons: PresetButton[];
  useTimestamp: boolean;
  startTimestamp: number | null;
};

type Asset = { id: string; path: string; name: string; preview: string };

type Settings = {
  autoLaunch: boolean;
  minimizeToTray: boolean;
  theme: 'light' | 'dark' | 'system';
};

type StoreData = {
  onboardingComplete: boolean;
  clientId: string;
  presets: Preset[];
  settings: Settings;
  assets: Asset[];
  activePresetId: string | null;
};

const defaultPreset: Preset = {
  id: `preset-${Date.now()}`,
  name: 'My First Presence',
  details: 'Craft your presence with ease',
  state: 'In the studio',
  largeImage: null,
  smallImage: null,
  buttons: [
    { label: 'Join my server', url: 'https://discord.gg/' },
    { label: 'View project', url: 'https://github.com/' },
  ],
  useTimestamp: true,
  startTimestamp: Date.now(),
};

const defaultSettings: Settings = {
  autoLaunch: false,
  minimizeToTray: true,
  theme: 'system',
};

const createId = () => `preset-${Math.random().toString(36).slice(2, 10)}`;

function App() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'presets' | 'assets' | 'settings'>('dashboard');
  const [rpcStatus, setRpcStatus] = useState<{ connected: boolean; clientId: string }>({ connected: false, clientId: '' });
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [tempClientId, setTempClientId] = useState('');
  const [message, setMessage] = useState<string>('Loading your workspace...');
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);

  const addLog = (entry: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()}: ${entry}`, ...prev].slice(0, 30));
  };

  const activePreset = useMemo(() => {
    if (!store) return null;
    return store.presets.find((preset) => preset.id === store.activePresetId) ?? store.presets[0] ?? null;
  }, [store]);

  const loadStore = async () => {
    const data = await window.electron.invoke('store/get', 'onboardingComplete');
    const clientId = await window.electron.invoke('store/get', 'clientId');
    const presets = (await window.electron.invoke('store/get', 'presets')) || [];
    const settings = (await window.electron.invoke('store/get', 'settings')) || defaultSettings;
    const assets = (await window.electron.invoke('store/get', 'assets')) || [];
    const activePresetId = await window.electron.invoke('store/get', 'activePresetId');

    setStore({
      onboardingComplete: Boolean(data),
      clientId: clientId || '',
      presets: presets.length ? presets : [defaultPreset],
      settings,
      assets,
      activePresetId: activePresetId || null,
    });
    setTempClientId(clientId || '');
    setMessage('Ready to build your presence.');
    addLog('Workspace loaded successfully.');
  };

  const saveStore = async (updates: Partial<StoreData>) => {
    if (!store) return;
    const merged = { ...store, ...updates } as StoreData;
    await Promise.all(Object.entries(updates).map(([key, value]) => window.electron.invoke('store/set', key, value)));
    setStore(merged);
    addLog(`Saved store key(s): ${Object.keys(updates).join(', ')}`);
  };

  const connectDiscord = async (clientId: string) => {
    const trimmed = clientId.trim();
    if (!trimmed) {
      setMessage('Enter a Discord application Client ID to connect.');
      addLog('Connection aborted: Client ID is empty.');
      return false;
    }
    if (!/^\d{17,20}$/.test(trimmed)) {
      setMessage('Invalid Client ID format. It should be a number with 17-20 digits.');
      addLog('Connection aborted: Client ID format invalid.');
      return false;
    }
    setIsConnecting(true);
    setMessage('Connecting to Discord...');
    addLog(`Attempting Discord connection for Client ID ${trimmed}.`);
    const connectPromise = window.electron.invoke('rpc/connect', trimmed);
    const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
      setTimeout(() => resolve({ success: false, error: 'Connection timed out. Ensure Discord is running and try again.' }), 15000);
    });
    const result = await Promise.race([connectPromise, timeoutPromise]);
    setIsConnecting(false);
    if (result.success) {
      setRpcStatus({ connected: true, clientId: trimmed });
      await saveStore({ clientId: trimmed });
      setMessage('Connected to Discord RPC. Your presence is ready to deploy.');
      addLog('Connected to Discord RPC successfully.');
      return true;
    }
    setRpcStatus({ connected: false, clientId: '' });
    setMessage(`Connection failed: ${result.error}. Check your Client ID and ensure Discord is running.`);
    addLog(`Discord connect failed: ${result.error}`);
    return false;
  };

  const applyPresence = async (preset: Preset) => {
    if (!rpcStatus.connected) {
      setMessage('Please connect to Discord before applying a presence.');
      addLog('Apply presence blocked: no Discord connection.');
      return;
    }

    const presence = {
      details: preset.details,
      state: preset.state,
      largeImageKey: preset.largeImage?.path ? 'custom-large' : undefined,
      smallImageKey: preset.smallImage?.path ? 'custom-small' : undefined,
      largeImageText: preset.largeImage?.name,
      smallImageText: preset.smallImage?.name,
      buttons: preset.buttons.filter((button) => button.label && button.url),
      startTimestamp: preset.useTimestamp ? preset.startTimestamp || Date.now() : undefined,
    };

    addLog('Sending presence update to Discord...');
    const result = await window.electron.invoke('rpc/update', presence);
    if (result.success) {
      setMessage('Presence successfully sent to Discord. Your activity is live.');
      addLog('Presence updated successfully.');
    } else {
      setMessage(`Failed updating presence: ${result.error}`);
      addLog(`Presence update failed: ${result.error}`);
    }
  };

  const clearPresence = async () => {
    await window.electron.invoke('rpc/clear');
    setMessage('Discord presence cleared. Ready for your next setup.');
    addLog('Discord presence cleared.');
  };

  const selectImage = async (field: 'largeImage' | 'smallImage') => {
    const image = await window.electron.invoke('file/selectImage');
    if (!image) return;
    if (!store) return;
    const preset = activePreset;
    if (!preset) return;

    const updated: Preset = {
      ...preset,
      [field]: {
        path: image.path,
        preview: image.preview,
      },
    } as Preset;

    const updatedPresets = store.presets.map((item) => (item.id === updated.id ? updated : item));
    setStore({
      ...store,
      presets: updatedPresets,
    });
    await window.electron.invoke('store/set', 'presets', updatedPresets);
    addLog(`Updated ${field} for preset ${updated.name}.`);
  };

  const addPreset = () => {
    if (!store) return;
    const newPreset = {
      ...defaultPreset,
      id: createId(),
      name: `Presence ${store.presets.length + 1}`,
      startTimestamp: Date.now(),
    };
    const presets = [...store.presets, newPreset];
    saveStore({ presets, activePresetId: newPreset.id });
    setSelectedPresetId(newPreset.id);
  };

  const deletePreset = (presetId: string) => {
    if (!store) return;
    const presets = store.presets.filter((preset) => preset.id !== presetId);
    const activePresetId = store.activePresetId === presetId ? presets[0]?.id ?? null : store.activePresetId;
    saveStore({ presets, activePresetId });
  };

  const updatePreset = (presetId: string, updates: Partial<Preset>) => {
    if (!store) return;
    const presets = store.presets.map((preset) => (preset.id === presetId ? { ...preset, ...updates } : preset));
    saveStore({ presets });
  };

  const completeOnboarding = async () => {
    if (!tempClientId.trim()) {
      setMessage('Enter your Discord application Client ID to continue.');
      addLog('Onboarding blocked: Client ID empty.');
      return;
    }
    setMessage('Completing onboarding...');
    addLog('Completing onboarding with provided Client ID.');
    await saveStore({ onboardingComplete: true, clientId: tempClientId });
    setStore((prev) => (prev ? { ...prev, onboardingComplete: true, clientId: tempClientId } : prev));
    setMessage('Onboarding complete. Connect and start your first presence.');
  };

  useEffect(() => {
    loadStore();
    const handleRpcStatus = (status: any) => {
      setRpcStatus(status);
      addLog(`RPC status changed: ${status.connected ? 'connected' : 'disconnected'}.`);
    };
    window.electron.on('rpc-status', handleRpcStatus);

    return () => {
      // No cleanup available for the current Electron bridge API.
    };
  }, []);

  useEffect(() => {
    if (store && !store.onboardingComplete) {
      setActiveTab('dashboard');
      setOnboardingStep(1);
    }
  }, [store]);

  const themeClass = store?.settings.theme === 'dark' ? 'theme-dark' : store?.settings.theme === 'light' ? 'theme-light' : 'theme-auto';

  return (
    <div className={`app-shell ${themeClass}`}>
      <aside className="sidebar">
        <div className="brand">
          <span>RPC Manager</span>
          <small>Discord RPC Maker & Manager</small>
        </div>
        <nav className="nav-menu">
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
          <button className={activeTab === 'presets' ? 'active' : ''} onClick={() => setActiveTab('presets')}>Presets</button>
          <button className={activeTab === 'assets' ? 'active' : ''} onClick={() => setActiveTab('assets')}>Assets</button>
          <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>Settings</button>
        </nav>
        <div className="status-panel">
          <span>Status</span>
          <strong>{rpcStatus.connected ? 'Connected' : 'Disconnected'}</strong>
          <small>{rpcStatus.connected ? `Client ID: ${rpcStatus.clientId}` : 'No RPC session active'}</small>
        </div>
      </aside>
      <main className="main-view">
        <header className="page-header">
          <div>
            <h1>RPC Manager</h1>
            <p>Build professional Windows Discord Rich Presence setups with onboarding, presets, and a live preview.</p>
          </div>
          <div className="header-actions">
            <button disabled={isConnecting} onClick={() => connectDiscord(store?.clientId || tempClientId)}>{isConnecting ? 'Connecting...' : rpcStatus.connected ? 'Reconnect' : 'Connect'}</button>
            <button className="secondary" onClick={clearPresence}>Clear Presence</button>
          </div>
        </header>

        <section className="message-bar">{message}</section>

        {!store?.onboardingComplete ? (
          <div className="onboarding-panel">
            <h2>Welcome to RPC Manager</h2>
            <p>Complete the first-time setup to start managing Discord Rich Presence like a pro.</p>
            <div className="onboarding-steps">
              <div className={onboardingStep === 1 ? 'step active' : 'step'}>
                <strong>1. Enter Discord App Client ID</strong>
                <p>Open the Discord Developer Portal, create an application, and paste its Client ID here.</p>
                <input value={tempClientId} onChange={(e) => setTempClientId(e.target.value)} placeholder="Discord App Client ID" />
              </div>
              <div className={onboardingStep === 2 ? 'step active' : 'step'}>
                <strong>2. Create your first preset</strong>
                <p>Set the text, state, and button actions for your custom presence.</p>
              </div>
              <div className={onboardingStep === 3 ? 'step active' : 'step'}>
                <strong>3. Connect and publish</strong>
                <p>Once connected, your presence will send instantly to Discord.</p>
              </div>
            </div>
            <button className="primary" onClick={completeOnboarding}>Finish Onboarding</button>
          </div>
        ) : null}

        {store?.onboardingComplete ? (
          <div className="workspace">
            {activeTab === 'dashboard' && (
              <section className="card-grid">
                <div className="card card-large">
                  <h2>Live Preview</h2>
                  {activePreset ? (
                    <div className="preview-card">
                      <div>
                        <span className="badge">Active Preset</span>
                        <h3>{activePreset.name}</h3>
                        <p>{activePreset.details}</p>
                        <small>{activePreset.state}</small>
                      </div>
                      <div className="preview-images">
                        {activePreset.largeImage ? <img src={activePreset.largeImage.preview} alt="Large asset" /> : <div className="placeholder">Large image</div>}
                        {activePreset.smallImage ? <img src={activePreset.smallImage.preview} alt="Small asset" /> : <div className="placeholder">Small image</div>}
                      </div>
                    </div>
                  ) : (
                    <p className="empty-state">No preset selected. Create one in the Presets tab.</p>
                  )}
                </div>
                <div className="card card-small">
                  <h2>Quick actions</h2>
                  <button onClick={() => activePreset && applyPresence(activePreset)}>Send Active Presence</button>
                  <button className="secondary" onClick={clearPresence}>Clear Discord Presence</button>
                  <button className="secondary" onClick={() => setActiveTab('presets')}>Manage Presets</button>
                </div>
                <div className="card card-small">
                  <h2>Tips</h2>
                  <ul>
                    <li>Use a valid Discord Client ID from the Developer Portal.</li>
                    <li>Choose image files to preview assets locally before sending.</li>
                    <li>Enable minimize-to-tray for background operation.</li>
                  </ul>
                </div>
              </section>
            )}

            {activeTab === 'presets' && (
              <section className="card-grid">
                <div className="card card-large">
                  <div className="card-header">
                    <h2>Presets</h2>
                    <button className="secondary" onClick={addPreset}>Add Preset</button>
                  </div>
                  {store.presets.length === 0 ? (
                    <p className="empty-state">Create your first presence preset to begin.</p>
                  ) : (
                    store.presets.map((preset) => (
                      <div key={preset.id} className={`preset-card ${store.activePresetId === preset.id ? 'active' : ''}`}>
                        <div className="preset-info" onClick={() => saveStore({ activePresetId: preset.id })}>
                          <strong>{preset.name}</strong>
                          <span>{preset.state}</span>
                        </div>
                        <div className="preset-actions">
                          <button onClick={() => deletePreset(preset.id)}>Delete</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="card card-large">
                  <h2>Edit Preset</h2>
                  {activePreset ? (
                    <div className="preset-editor">
                      <label>
                        Preset name
                        <input value={activePreset.name} onChange={(e) => updatePreset(activePreset.id, { name: e.target.value })} />
                      </label>
                      <label>
                        Details
                        <input value={activePreset.details} onChange={(e) => updatePreset(activePreset.id, { details: e.target.value })} />
                      </label>
                      <label>
                        State
                        <input value={activePreset.state} onChange={(e) => updatePreset(activePreset.id, { state: e.target.value })} />
                      </label>
                      <label>
                        Use timestamp
                        <input type="checkbox" checked={activePreset.useTimestamp} onChange={(e) => updatePreset(activePreset.id, { useTimestamp: e.target.checked })} />
                      </label>
                      <div className="asset-row">
                        <label>
                          Large image
                          <button className="secondary" onClick={() => selectImage('largeImage')}>{activePreset.largeImage ? 'Replace' : 'Browse'}</button>
                        </label>
                        <label>
                          Small image
                          <button className="secondary" onClick={() => selectImage('smallImage')}>{activePreset.smallImage ? 'Replace' : 'Browse'}</button>
                        </label>
                      </div>
                      <div className="button-grid">
                        {activePreset.buttons.slice(0, 2).map((button, idx) => (
                          <div key={idx} className="button-row">
                            <input value={button.label} onChange={(e) => {
                              const buttons = [...activePreset.buttons];
                              buttons[idx] = { ...buttons[idx], label: e.target.value };
                              updatePreset(activePreset.id, { buttons });
                            }} maxLength={80} placeholder="Button label (max 80 chars)" />
                            <input value={button.url} onChange={(e) => {
                              const buttons = [...activePreset.buttons];
                              buttons[idx] = { ...buttons[idx], url: e.target.value };
                              updatePreset(activePreset.id, { buttons });
                            }} maxLength={512} placeholder="https://example.com (max 512 chars)" />
                          </div>
                        ))}
                        {activePreset.buttons.length < 2 && (
                          <button className="secondary" onClick={() => {
                            const buttons = [...activePreset.buttons, { label: 'New action', url: 'https://example.com' }];
                            updatePreset(activePreset.id, { buttons });
                          }}>Add Button (max 2)</button>
                        )}
                        {activePreset.buttons.length >= 2 && (
                          <small style={{gridColumn: '1 / -1', color: '#888'}}>Discord supports up to 2 buttons per presence</small>
                        )}
                      </div>
                      <button className="primary" onClick={() => applyPresence(activePreset)}>Send This Presence</button>
                    </div>
                  ) : (
                    <p className="empty-state">Select a preset to edit its settings.</p>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'assets' && (
              <section className="card-grid">
                <div className="card card-large">
                  <h2>Image Browser</h2>
                  <p>Choose images for large and small presence artwork. The app previews local assets before sending.</p>
                  <div className="asset-gallery">
                    <div className="asset-card">
                      <span className="asset-title">Large image</span>
                      {activePreset?.largeImage ? <img src={activePreset.largeImage.preview} alt="Large" /> : <div className="placeholder">No large image</div>}
                      <button onClick={() => selectImage('largeImage')}>Choose large image</button>
                    </div>
                    <div className="asset-card">
                      <span className="asset-title">Small image</span>
                      {activePreset?.smallImage ? <img src={activePreset.smallImage.preview} alt="Small" /> : <div className="placeholder">No small image</div>}
                      <button onClick={() => selectImage('smallImage')}>Choose small image</button>
                    </div>
                  </div>
                </div>
                <div className="card card-small">
                  <h2>How it works</h2>
                  <ul>
                    <li>Discord displays image keys from your application assets.</li>
                    <li>Use this browser to preview local files before you upload them online.</li>
                    <li>For full Discord asset support, add matching images to your app on the Developer Portal.</li>
                  </ul>
                </div>
              </section>
            )}

            {activeTab === 'settings' && (
              <section className="card-grid">
                <div className="card card-large">
                  <h2>Settings</h2>
                  <label>
                    Discord Client ID
                    <input value={store.clientId} onChange={(e) => saveStore({ clientId: e.target.value })} />
                  </label>
                  <label>
                    Auto-launch RPC Manager
                    <input type="checkbox" checked={store.settings.autoLaunch} onChange={(e) => saveStore({ settings: { ...store.settings, autoLaunch: e.target.checked } })} />
                  </label>
                  <label>
                    Minimize to tray
                    <input type="checkbox" checked={store.settings.minimizeToTray} onChange={(e) => saveStore({ settings: { ...store.settings, minimizeToTray: e.target.checked } })} />
                  </label>
                  <label>
                    Theme
                    <select value={store.settings.theme} onChange={(e) => saveStore({ settings: { ...store.settings, theme: e.target.value as Settings['theme'] } })}>
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                </div>
                <div className="card card-small">
                  <h2>Credits</h2>
                  <p>Built for Windows Discord Rich Presence creators.</p>
                  <p>Copyright © 2026 kavaliersdelikt.</p>
                  <p>Engineered as RPC Manager, with onboarding, background tray support, presets, and live Discord RPC integration.</p>
                </div>
                <div className="card card-small">
                  <h2>Debug Logs</h2>
                  <p>Latest connection and RPC events are shown here for troubleshooting.</p>
                  <div className="debug-log">
                    {logs.length === 0 ? (
                      <p className="empty-state">No debug logs yet. Try connecting to Discord or sending a presence.</p>
                    ) : (
                      logs.map((log, index) => <div key={index} className="debug-line">{log}</div>)
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default App;
