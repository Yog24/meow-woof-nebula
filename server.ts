import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Health check/Ping
  app.get("/api/ping", (req, res) => {
    res.status(200).send("pong");
  });

  // Unique AI Proxy Route to avoid collision with standard API paths
  app.post("/api/v1/pet-ai-proxy", async (req, res) => {
    try {
      const { baseUrl, apiKey, body } = req.body;

      if (!baseUrl || !apiKey || !body) {
        console.error("Proxy Error: Missing parameters", { hasBaseUrl: !!baseUrl, hasKey: !!apiKey, hasBody: !!body });
        return res.status(400).json({ error: { message: "Missing required proxy parameters" } });
      }

      // Cleanup baseUrl and ensure correct endpoint
      let cleanBase = normalizeBaseUrl(baseUrl);
      if (cleanBase.endsWith('/chat/completions')) {
        cleanBase = cleanBase.replace(/\/chat\/completions$/, '');
      }
      
      const targetUrl = `${cleanBase}/chat/completions`;
      console.log(`[Proxy] Strictly mirroring Python request to: ${targetUrl}`);

      // Construct exactly what Python sends
      const proxyBody = {
        model: body.model,
        messages: body.messages,
        ...(body.temperature !== undefined && { temperature: body.temperature }),
        ...(body.max_tokens !== undefined && { max_tokens: body.max_tokens }),
        ...(body.response_format !== undefined && { response_format: body.response_format })
      };

      const bodyStr = JSON.stringify(proxyBody);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          'User-Agent': 'python-requests/2.31.0',
          'Content-Length': Buffer.byteLength(bodyStr).toString()
        },
        body: bodyStr
      });

      const responseText = await response.text();
      let responseJson: any = {};
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = { message: responseText };
      }

      if (!response.ok) {
        console.error(`[Proxy] Remote Error: ${response.status} from ${targetUrl}`, responseText);
        
        // Construct a super-detailed error for the user to see
        const errorMessage = responseJson.error?.message || 
                             responseJson.message || 
                             `Remote API status ${response.status}`;
        
        return res.status(response.status).json({
          error: {
            message: `${errorMessage} (HTTP ${response.status})`,
            targetUrl: targetUrl,
            rawResponse: responseText.substring(0, 300), // More context
            origin: 'remote' // Identify this as a remote error
          }
        });
      }

      res.status(200).json(responseJson);
    } catch (error) {
      console.error("[Proxy] Critical Error:", error);
      res.status(500).json({ error: { message: `Internal Proxy Error: ${error instanceof Error ? error.message : "Unknown"}`, origin: 'proxy' } });
    }
  });

  app.use("/api/v1", async (req, res) => {
    const backendTarget = (process.env.BACKEND_PROXY_TARGET || "http://127.0.0.1:3100").replace(/\/$/, "");
    const targetUrl = `${backendTarget}/api/v1${req.url}`;
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value || key.toLowerCase() === "host" || key.toLowerCase() === "content-length") continue;
        headers.set(key, Array.isArray(value) ? value.join(",") : value);
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body || {}),
      });

      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "content-encoding") {
          res.setHeader(key, value);
        }
      });
      const body = Buffer.from(await response.arrayBuffer());
      res.status(response.status).send(body);
    } catch (error) {
      console.error(`[Backend Proxy] Failed to forward ${req.method} ${targetUrl}`, error);
      res.status(502).json({
        error: {
          message: `Backend proxy failed: ${error instanceof Error ? error.message : "unknown error"}`,
          targetUrl,
        },
      });
    }
  });
  
  // Image Generation Proxy Route
  app.post("/api/ai/proxy-image", async (req, res) => {
    try {
      const { baseUrl, apiKey, body } = req.body;
      if (!baseUrl || !apiKey || !body) {
        return res.status(400).json({ error: { message: "Missing required image proxy parameters" } });
      }

      let cleanBase = normalizeBaseUrl(baseUrl);
      if (cleanBase.endsWith('/images/generations')) {
        cleanBase = cleanBase.replace(/\/images\/generations$/, '');
      }

      const targetUrl = `${cleanBase}/images/generations`;
      console.log(`[Proxy] Image Request to: ${targetUrl}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error(`[Proxy] Image Remote Error: ${response.status} at ${targetUrl}`, data);
        return res.status(response.status).json({
          error: {
            message: data.error?.message || `Image API returned ${response.status} at ${targetUrl}`,
            targetUrl: targetUrl
          }
        });
      }
      res.json(data);
    } catch (error) {
      console.error("[Proxy] Image Critical Error:", error);
      res.status(500).json({ error: { message: error instanceof Error ? error.message : "Internal Server Error" } });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Support SPA routing
    app.get('*', (req, res) => {
      // Don't fallback for missing API routes
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: "API route not found" });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started on port ${PORT}`);
  });
}

startServer();

function normalizeBaseUrl(rawValue: string): string {
  const extractedUrl = rawValue.trim().match(/https?:\/\/[^\s，,，）)]+/i)?.[0] || rawValue.trim();
  return extractedUrl.replace(/\/$/, '');
}
