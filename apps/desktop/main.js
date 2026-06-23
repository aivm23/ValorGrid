const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, shell } = require('electron');
const { readAlphaVantageKey } = require('../server/src/platform/runtime-secrets');

let mainWindow = null;
let server = null;

function ensureRuntimeDirs(userDataDir) {
  const dataDir = path.join(userDataDir, 'data');
  const backupDir = path.join(userDataDir, 'backups');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  return {
    dbPath: path.join(dataDir, 'portfolio.sqlite'),
    backupDir,
  };
}

function startLocalServer() {
  const userDataDir = process.env.VALORGRID_DESKTOP_USER_DATA_DIR || app.getPath('userData');
  const { dbPath, backupDir } = ensureRuntimeDirs(userDataDir);

  process.env.HOST = '127.0.0.1';
  process.env.PORT = '0';
  process.env.PORTFOLIO_DB_PATH = dbPath;
  process.env.VALORGRID_BACKUP_DIR = backupDir;
  process.env.VALORGRID_RUNTIME_MODE = 'desktop';
  process.env.VALORGRID_DESKTOP_USER_DATA_DIR = userDataDir;

  const envKey = process.env.VALORGRID_ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY || '';
  const savedKey = envKey ? '' : readAlphaVantageKey(backupDir);
  if (savedKey) {
    process.env.VALORGRID_ALPHA_VANTAGE_API_KEY = savedKey;
    process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = 'local';
  } else if (envKey) {
    process.env.VALORGRID_ALPHA_VANTAGE_API_KEY_SOURCE = 'env';
  }

  const runtime = require('../server/src/app-core');
  server = runtime.server;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(runtime.port, runtime.host, () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('ValorGrid did not expose a local HTTP port.'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    icon: path.join(__dirname, '..', '..', 'assets', 'brand', 'valorgrid-logo.png'),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.loadURL(url);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      const url = await startLocalServer();
      createWindow(url);
    } catch (error) {
      console.error('ValorGrid startup failed:', error);
      const { dialog } = require('electron');
      dialog.showErrorBox(
        'ValorGrid no pudo iniciar',
        `${error.message}\n\nRuta: ${__dirname}\nRevisa la consola para más detalles.`,
      );
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    if (server?.listening) server.close();
  });
}
