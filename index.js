const express = require("express");
const { connect } = require("./lib/index");
const config = require("./config.js");
const app = express();
const PORT = process.env.PORT || 8000;
const db = require('./lib/database/settingdb');
app.use(express.json());

// ==================== ROUTES ====================
app.get("/", (req, res) => {
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
  });
});
// ================================================
// Start server and initialize WhatsApp session (if configured)
app.listen(PORT, async () => {
   try {
    global.baileys = await import("baileys");
     console.log(`Server running on port ${PORT}`);
  console.log("Initializing databases...");
  await db.init({
      autosaveInterval: 5000,
      databaseUrl: config.DATABASE_URL || null
    });

  console.log('DB initialized. startup:', db.getStartupTime());
  const sessionId = config.SESSION_ID;
  if (!sessionId) {
    console.log("please set SESSION_ID in config.js");
    return;
  }
 const conn = await connect();
 
    console.log(`WhatsApp session '${sessionId}' initialized`);
  } catch (err) {
    console.error("Failed to initialize WhatsApp session:", err?.message || err);
  }
});

process.on("unhandledRejection", (err) => console.error("UnhandledRejection:", err));
process.on("uncaughtException", (err) => {
  console.error("UncaughtException:", err);
  process.exit(1);
});

async function waitForOpen(sock, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sock.ev.off("connection.update", handler);
      reject(new Error("Timed out waiting for connection to open"));
    }, timeoutMs);

    const handler = (update) => {
      const { connection, lastDisconnect } = update || {};

      if (connection === "open") {
        clearTimeout(timeout);
        sock.ev.off("connection.update", handler);
        resolve();
        return;
      } else if (connection === "close") {
        clearTimeout(timeout);
        sock.ev.off("connection.update", handler);
        const err =
          lastDisconnect?.error || new Error("Connection closed before open");
        reject(err);
      }
    };

    sock.ev.on("connection.update", handler);
  });
}