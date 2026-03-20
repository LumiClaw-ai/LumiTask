import { fork, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { app } from "electron";
import net from "net";

const PORT_FILE = path.join(os.homedir(), ".lumitask", "port");

let serverProcess: ChildProcess | null = null;
let serverPort = 3179;

function getServerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone", "server.js");
  }
  return path.join(__dirname, "..", "..", ".next", "standalone", "server.js");
}

export function getServerUrl(): string {
  return `http://127.0.0.1:${serverPort}`;
}

export async function startServer(): Promise<void> {
  const serverPath = getServerPath();
  console.log(`[Electron] Starting server: ${serverPath}`);

  serverPort = await findAvailablePort(3179);

  const env = {
    ...process.env,
    PORT: String(serverPort),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
  };

  serverProcess = fork(serverPath, [], {
    env,
    stdio: "pipe",
    cwd: app.isPackaged
      ? path.join(process.resourcesPath, "standalone")
      : path.join(__dirname, "..", "..", ".next", "standalone"),
  });

  serverProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[Server:err] ${data.toString().trim()}`);
  });

  serverProcess.on("exit", (code) => {
    console.log(`[Server] exited with code ${code}`);
    serverProcess = null;
  });

  await waitForServer(30_000);

  // Write port file so CLI/Agent can discover the actual port
  try {
    fs.mkdirSync(path.dirname(PORT_FILE), { recursive: true });
    fs.writeFileSync(PORT_FILE, String(serverPort));
  } catch {}

  console.log(`[Electron] Server ready at ${getServerUrl()}`);
}

export function stopServer(): void {
  if (serverProcess) {
    console.log("[Electron] Stopping server...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
  // Clean up port file
  try { fs.unlinkSync(PORT_FILE); } catch {}
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const start = Date.now();
  const url = getServerUrl();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 10; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
      server.on("error", () => resolve(false));
    });
    if (available) return port;
  }
  return startPort;
}
