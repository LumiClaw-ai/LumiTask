import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_SETTINGS: Record<string, string> = {
  defaultWorkingDirectory: join(homedir(), "Downloads"),
};

export async function GET() {
  try {
    // Start with defaults
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    // Override with all saved settings from DB
    const { getAllSettings } = await import("@/lib/db");
    const saved = getAllSettings();
    for (const [key, value] of Object.entries(saved)) {
      settings[key] = value;
    }
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: "Failed to get settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.settings && typeof body.settings === "object") {
      for (const [key, value] of Object.entries(body.settings)) {
        setSetting(key, String(value));
      }
    } else if (body.key && body.value !== undefined) {
      setSetting(body.key, String(body.value));
    } else {
      // Flat format: { defaultAgentId: "xxx", ... }
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === "string") {
          setSetting(key, value);
        }
      }
    }

    // Return updated settings
    const settings: Record<string, string> = {};
    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
      settings[key] = getSetting(key, defaultValue);
    }
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
