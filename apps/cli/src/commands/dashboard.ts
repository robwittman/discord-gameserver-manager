import { Command } from "commander";
import chalk from "chalk";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve path to dashboard dist folder
function getDashboardPath(): string {
  // When running from dist: apps/cli/dist/commands/dashboard.js
  // Dashboard is at: apps/dashboard/dist
  const distPath = join(__dirname, "../../../dashboard/dist");
  if (existsSync(distPath)) {
    return distPath;
  }

  // When running with tsx from src: apps/cli/src/commands/dashboard.ts
  const srcPath = join(__dirname, "../../dashboard/dist");
  if (existsSync(srcPath)) {
    return srcPath;
  }

  throw new Error(
    "Dashboard not built. Run: pnpm --filter @discord-server-manager/dashboard build"
  );
}

// Simple static file server
function createStaticServer(
  root: string,
  apiUrl: string,
  port: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    };

    const server = createServer((req, res) => {
      const url = req.url ?? "/";

      // Serve runtime config
      if (url === "/config.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ apiUrl }));
        return;
      }

      // Determine file path
      let filePath = join(root, url === "/" ? "/index.html" : url);

      // SPA fallback: serve index.html for routes without file extension
      if (!url.includes(".") && url !== "/") {
        filePath = join(root, "index.html");
      }

      // Get file extension and mime type
      const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";

      // Read and serve file
      try {
        if (!existsSync(filePath)) {
          // Fallback to index.html for SPA routing
          filePath = join(root, "index.html");
        }

        const content = readFileSync(filePath);
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.on("error", reject);
    server.listen(port, () => resolve());
  });
}

export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description("Start the admin dashboard")
    .option("-p, --port <port>", "Dashboard port", "3001")
    .option("--api-url <url>", "API server URL", process.env.API_URL || "http://localhost:3000")
    .option("--no-open", "Don't open browser automatically")
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const apiUrl = options.apiUrl;
      const shouldOpen = options.open !== false;

      try {
        const dashboardPath = getDashboardPath();
        console.log(chalk.gray(`Serving dashboard from: ${dashboardPath}`));
        console.log(chalk.gray(`API URL: ${apiUrl}`));

        await createStaticServer(dashboardPath, apiUrl, port);

        const dashboardUrl = `http://localhost:${port}`;
        console.log(chalk.green(`\nDashboard running at ${chalk.bold(dashboardUrl)}`));
        console.log(chalk.gray("Press Ctrl+C to stop\n"));

        if (shouldOpen) {
          // Dynamic import for open (ESM-only package)
          const open = (await import("open")).default;
          await open(dashboardUrl);
        }
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    });
}
