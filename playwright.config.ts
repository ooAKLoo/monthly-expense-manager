import { defineConfig } from "@playwright/test";

const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./tests",
  reporter: "list",
  use: {
    baseURL: "http://localhost:5176",
    trace: "retain-on-failure",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run dev:web -- --host 127.0.0.1 --port 5176 --strictPort",
        url: "http://localhost:5176",
        reuseExistingServer: true,
      },
});
