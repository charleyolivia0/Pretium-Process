const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const isDev = !app.isPackaged;
let mainWindow = null;

async function resolveDevServerUrl() {
  const explicit = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const candidates = [5173, 5174, 5175, 5176, 5177, 5178];
  for (const port of candidates) {
    const base = `http://localhost:${port}`;
    try {
      const response = await fetch(base, { method: "GET" });
      if (response.ok) return base;
    } catch {
      // Try next candidate port.
    }
  }
  return "http://localhost:5173";
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 420,
    minHeight: 620,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    const devServerUrl = await resolveDevServerUrl();
    await mainWindow.loadURL(`${devServerUrl}/#/companion`);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      hash: "/companion",
    });
  }
}

app.whenReady().then(async () => {
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
