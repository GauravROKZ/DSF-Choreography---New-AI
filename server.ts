import { createServer as createViteServer } from "vite";
import path from "path";
import apiRouter from "./api/index";
import express from "express";

const PORT = 3000;

async function startServer() {
  const app = express();

  // 1. Static/Global Middleware
  app.use(express.json());

  // 2. Mount API Router
  app.use("/api", apiRouter);

  // 3. Vite or SPA Fallback
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BOOT] Server v1.0.4-HF-DEBUG running on http://localhost:${PORT}`);
    console.log(`[BOOT] NODE_ENV: ${process.env.NODE_ENV}`);
    try {
      const axios = require("axios");
      console.log(`[BOOT] axios.defaults.baseURL: ${axios.defaults.baseURL}`);
    } catch(e) {}
    console.log(`[BOOT] HTTP_PROXY: ${process.env.HTTP_PROXY}`);
    console.log(`[BOOT] HTTPS_PROXY: ${process.env.HTTPS_PROXY}`);
  });
}

startServer();
