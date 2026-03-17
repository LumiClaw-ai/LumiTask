import { NextRequest, NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export async function GET(request: NextRequest) {
  try {
    const dir = request.nextUrl.searchParams.get("dir") || homedir();

    let directories: { name: string; path: string }[] = [];
    try {
      const entries = readdirSync(dir);
      directories = entries
        .filter((entry) => {
          try {
            return statSync(join(dir, entry)).isDirectory();
          } catch {
            return false;
          }
        })
        .filter((name) => !name.startsWith("."))
        .sort()
        .map((name) => ({ name, path: join(dir, name) }));
    } catch {
      // dir not found or not readable - return empty
    }

    return NextResponse.json({
      current: dir,
      parent: dirname(dir),
      directories,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to browse" }, { status: 500 });
  }
}
