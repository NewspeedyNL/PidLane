import puppeteer from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  AI: Ai;
}

interface BugReport {
  url: string;
  timestamp: string;
  consoleErrors: string[];
  networkErrors: string[];
  pageErrors: string[];
  screenshot: string | null;
  aiAnalysis: string | null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/analyze" && req.method === "POST") {
      const body = await req.json<{ url: string }>();
      if (!body.url) {
        return new Response(JSON.stringify({ error: "Missing 'url' in body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const report = await analyzePage(env, body.url);
      return new Response(JSON.stringify(report, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "GET") {
      return new Response(HTML_UI, {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

async function analyzePage(env: Env, targetUrl: string): Promise<BugReport> {
  const browser = await puppeteer.launch(env.BROWSER);
  const page = await browser.newPage();

  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  page.on("requestfailed", (req) => {
    networkErrors.push(
      `${req.method()} ${req.url()} - ${req.failure()?.errorText ?? "unknown failure"}`
    );
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      networkErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  let screenshot: string | null = null;

  try {
    await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 30000 });
    const ssBuf = await page.screenshot({ type: "png" });
    screenshot = ssBuf.toString("base64");
  } catch (err) {
    pageErrors.push(`Navigation error: ${(err as Error).message}`);
  } finally {
    await browser.close();
  }

  let aiAnalysis: string | null = null;
  const hasErrors =
    consoleErrors.length > 0 ||
    networkErrors.length > 0 ||
    pageErrors.length > 0;

  if (hasErrors) {
    const prompt = buildAnalysisPrompt(targetUrl, consoleErrors, networkErrors, pageErrors);
    const aiResponse = await env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct",
      {
        messages: [
          {
            role: "system",
            content:
              "You are a senior front-end engineer. Analyze website errors and provide concrete code fixes. For each error: (1) explain the root cause, (2) provide the exact code change needed. Be concise and actionable.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 2048,
      }
    );
    aiAnalysis = (aiResponse as { response?: string }).response ?? null;
  } else {
    aiAnalysis = "No errors detected on this page.";
  }

  return {
    url: targetUrl,
    timestamp: new Date().toISOString(),
    consoleErrors,
    networkErrors,
    pageErrors,
    screenshot,
    aiAnalysis,
  };
}

function buildAnalysisPrompt(
  url: string,
  consoleErrors: string[],
  networkErrors: string[],
  pageErrors: string[]
): string {
  const sections: string[] = [`URL: ${url}`];

  if (consoleErrors.length) {
    sections.push(
      `\n## Console Errors\n${consoleErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
    );
  }
  if (networkErrors.length) {
    sections.push(
      `\n## Network Errors\n${networkErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
    );
  }
  if (pageErrors.length) {
    sections.push(
      `\n## Uncaught Page Errors\n${pageErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
    );
  }

  sections.push(
    "\nAnalyze each error above. For each one provide:\n" +
      "1. **Root cause** - what is wrong\n" +
      "2. **Fix** - the exact code or configuration change needed\n" +
      "3. **Severity** - critical / high / medium / low"
  );

  return sections.join("\n");
}

const HTML_UI = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Bug Fixer</title>
<style>
body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;background:#0d1117;color:#e6edf3}
h1{color:#58a6ff}
input[type=url]{width:70%;padding:.6rem;border:1px solid #30363d;background:#161b22;color:#e6edf3;border-radius:6px}
button{padding:.6rem 1.2rem;background:#238636;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600}
button:disabled{opacity:.5}
pre{background:#161b22;padding:1rem;border-radius:6px;overflow-x:auto;white-space:pre-wrap;border:1px solid #30363d}
.error{color:#f85149}
.label{color:#8b949e;font-size:.85rem;margin-top:1rem;margin-bottom:.3rem}
img{max-width:100%;border-radius:6px;margin-top:.5rem;border:1px solid #30363d}
</style>
</head>
<body>
<h1>AI Bug Fixer</h1>
<p>Enter a URL to analyze for bugs:</p>
<form id="form">
<input type="url" id="url" placeholder="https://example.com" required>
<button type="submit" id="btn">Analyze</button>
</form>
<div id="result" style="margin-top:1.5rem"></div>
<script>
document.getElementById("form").addEventListener("submit", function(e) {
  e.preventDefault();
  var url = document.getElementById("url").value;
  var btn = document.getElementById("btn");
  var result = document.getElementById("result");
  btn.disabled = true;
  btn.textContent = "Analyzing...";
  result.innerHTML = "<p>Loading page and capturing errors...</p>";
  fetch("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    var html = "";
    if (data.screenshot) html += "<div class='label'>Screenshot</div><img src='data:image/png;base64," + data.screenshot + "'>";
    if (data.consoleErrors && data.consoleErrors.length) html += "<div class='label'>Console Errors</div><pre class='error'>" + data.consoleErrors.join("\\n") + "</pre>";
    if (data.networkErrors && data.networkErrors.length) html += "<div class='label'>Network Errors</div><pre class='error'>" + data.networkErrors.join("\\n") + "</pre>";
    if (data.pageErrors && data.pageErrors.length) html += "<div class='label'>Page Errors</div><pre class='error'>" + data.pageErrors.join("\\n") + "</pre>";
    html += "<div class='label'>AI Analysis</div><pre>" + (data.aiAnalysis || "No analysis") + "</pre>";
    result.innerHTML = html;
  })
  .catch(function(err) {
    result.innerHTML = "<pre class='error'>" + err.message + "</pre>";
  })
  .finally(function() {
    btn.disabled = false;
    btn.textContent = "Analyze";
  });
});
</script>
</body>
</html>`;