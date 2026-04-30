import { app, BrowserWindow, ipcMain, nativeImage, Tray } from 'electron';
import path from 'path';
import fs from 'fs';
import Store from 'electron-store';
import DiscordRPC from 'discord-rpc';

const store = new Store({
  name: 'rpc-manager',
  defaults: {
    onboardingComplete: false,
    clientId: '',
    presets: [],
    settings: {
      autoLaunch: false,
      minimizeToTray: true,
      theme: 'system',
    },
    assets: [],
    activePresetId: null,
  },
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let rpcClient: InstanceType<typeof DiscordRPC> | null = null;
let rpcState = { connected: false, clientId: '' };

function getHtmlPath() {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5173';
  }
  return `file://${path.join(__dirname, '../../dist/renderer/index.html')}`;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    icon: path.join(__dirname, '../../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  mainWindow.on('close', (event) => {
    const settings = store.get('settings') as any;
    if (settings.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    mainWindow = null;
  });

  mainWindow.loadURL(getHtmlPath());
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../public/icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('RPC Manager • Discord RPC Manager');
  tray.on('click', () => {
    if (!mainWindow) {
      createMainWindow();
    }
    mainWindow?.show();
  });
}

async function updateDiscordState(presence: any) {
  if (!rpcClient || !rpcState.connected) {
    return { success: false, error: 'Not connected to Discord RPC' };
  }

  try {
    const activity: any = {
      details: presence.details,
      state: presence.state,
      startTimestamp: presence.startTimestamp,
    };
    
    if (presence.largeImageKey) {
      activity.largeImageKey = presence.largeImageKey;
      activity.largeImageText = presence.largeImageText;
    }
    if (presence.smallImageKey) {
      activity.smallImageKey = presence.smallImageKey;
      activity.smallImageText = presence.smallImageText;
    }
    if (presence.buttons && presence.buttons.length > 0) {
      activity.buttons = presence.buttons.slice(0, 2);
    }
    
    await rpcClient.setActivity(activity);
    return { success: true };
  } catch (error) {
    return { success: false, error: `${error}` };
  }
}

async function connectRpc(clientId: string) {
  if (rpcClient) {
    rpcClient.destroy();
    rpcClient = null;
  }

  rpcClient = new DiscordRPC({ transport: 'ipc' });
  rpcState = { connected: false, clientId };

  rpcClient.on('ready', () => {
    rpcState.connected = true;
    rpcState.clientId = clientId;
    mainWindow?.webContents.send('rpc-status', { connected: true, clientId });
  });

  rpcClient.on('disconnected', () => {
    rpcState.connected = false;
    mainWindow?.webContents.send('rpc-status', { connected: false, clientId });
  });

  try {
    await rpcClient.login({ clientId });
    return { success: true };
  } catch (error) {
    rpcState.connected = false;
    return { success: false, error: `${error}` };
  }
}

ipcMain.handle('store/get', (event, key) => store.get(key));
ipcMain.handle('store/set', (event, key, value) => store.set(key, value));
ipcMain.handle('app/getPath', () => app.getPath('userData'));
ipcMain.handle('rpc/connect', async (event, clientId: string) => {
  const result = await connectRpc(clientId);
  return result;
});
ipcMain.handle('rpc/update', async (event, presence) => updateDiscordState(presence));
ipcMain.handle('rpc/clear', async () => {
  if (rpcClient && rpcState.connected) {
    await rpcClient.clearActivity();
  }
  return { success: true };
});
ipcMain.handle('rpc/status', () => rpcState);
ipcMain.handle('file/selectImage', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Choose an image asset',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const fileData = fs.readFileSync(selectedPath).toString('base64');
  return {
    path: selectedPath,
    name: path.basename(selectedPath),
    preview: `data:image/${path.extname(selectedPath).slice(1)};base64,${fileData}`,
  };
});

app.on('ready', () => {
  createMainWindow();
  createTray();
  const settings = store.get('settings') as any;
  if (settings?.autoLaunch) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  if (rpcClient) {
    rpcClient.destroy();
  }
});
