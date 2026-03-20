import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from "electron";
import path from "path";
import { startServer, stopServer, getServerUrl } from "./server";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let badgeTimer: ReturnType<typeof setInterval> | null = null;

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
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}

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

app.on("ready", async () => {
  try {
    await startServer();
    mainWindow = createWindow();
    createTray();
    startBadgePoller();
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
