import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } from "electron";
import path from "path";
import { startServer, stopServer, getServerUrl } from "./server";
import { autoUpdater } from "electron-updater";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let badgeTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================
// Auto Updater
// ============================================================

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log(`[Updater] New version available: ${info.version}`);
    tray?.setToolTip(`LumiTask — Downloading update v${info.version}...`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[Updater] Update downloaded: ${info.version}`);
    tray?.setToolTip("LumiTask");

    // Show notification to user
    const result = dialog.showMessageBoxSync(mainWindow!, {
      type: "info",
      title: "LumiTask 更新",
      message: `新版本 v${info.version} 已下载完成`,
      detail: "重启应用即可完成更新。",
      buttons: ["立即重启", "稍后"],
      defaultId: 0,
    });

    if (result === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err.message);
  });

  // Check for updates every 4 hours
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

// ============================================================
// Window
// ============================================================

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "LumiTask",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#09090b", // zinc-950
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  win.loadURL(getServerUrl());

  win.once("ready-to-show", () => {
    win.show();
  });

  // Hide instead of close on macOS
  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http") && !url.includes("localhost") && !url.includes("127.0.0.1")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  return win;
}

// ============================================================
// Tray
// ============================================================

function createTray(): void {
  const iconPath = path.join(__dirname, "icons", "tray-icon.png");
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("LumiTask");

  const contextMenu = Menu.buildFromTemplate([
    { label: "打开 Dashboard", click: () => mainWindow?.show() },
    { label: "检查更新", click: () => autoUpdater.checkForUpdates().catch(() => {}) },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}

// ============================================================
// Badge polling
// ============================================================

function startBadgePoller(): void {
  const poll = async () => {
    try {
      const res = await fetch(`${getServerUrl()}/api/dashboard`);
      const data = await res.json();
      const count = (data.running || 0) + (data.blocked || 0);

      tray?.setTitle(count > 0 ? String(count) : "");

      if (count > 0) {
        app.dock?.setBadge(String(count));
      } else {
        app.dock?.setBadge("");
      }
    } catch {}
  };

  poll();
  badgeTimer = setInterval(poll, 10_000);
}

// ============================================================
// App lifecycle
// ============================================================

app.on("ready", async () => {
  try {
    await startServer();
    mainWindow = createWindow();
    createTray();
    startBadgePoller();
    setupAutoUpdater();
  } catch (err) {
    console.error("Failed to start:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // Don't quit on macOS — tray stays
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    mainWindow = createWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (badgeTimer) clearInterval(badgeTimer);
  stopServer();
});
