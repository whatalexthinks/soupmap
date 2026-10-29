import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import express from "express";
import { CLERK_PROXY_PATH, createClerkProxy } from "../server/middlewares/clerkProxyMiddleware.ts";

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function send(url: string, method = "GET", body?: string) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = request(url, {
      method,
      headers: {
        "x-forwarded-host": "soupmap.example, internal.example",
        "x-forwarded-proto": "https",
        "x-forwarded-for": "192.0.2.10, 192.0.2.11",
        cookie: "test_session=example",
        ...(body === undefined ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(body) }),
      },
    }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(5_000, () => req.destroy(new Error("Proxy test timed out")));
    req.end(body);
  });
}

test("Clerk transport preserves mounted paths, queries, raw bodies, headers and cookies", async () => {
  const received: { url?: string; headers?: IncomingHttpHeaders; body?: string } = {};
  const upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      Object.assign(received, { url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
      res.writeHead(201, { "content-type": "application/json", "set-cookie": ["one=1; HttpOnly", "two=2; Secure"] });
      res.write('{"ok":');
      res.end("true}");
    });
  });
  const target = await listen(upstream);
  const app = express();
  app.use(CLERK_PROXY_PATH, createClerkProxy("test-only-placeholder", target));
  app.use(express.json());
  const server = createServer(app);
  const origin = await listen(server);
  try {
    const body = '{"email_address":"test@example.invalid"}';
    const response = await send(`${origin}${CLERK_PROXY_PATH}/v1/client/sign_ins?__clerk_api_version=test`, "POST", body);
    assert.equal(received.url, "/v1/client/sign_ins?__clerk_api_version=test");
    assert.equal(received.body, body);
    assert.equal(received.headers?.["clerk-proxy-url"], `https://soupmap.example${CLERK_PROXY_PATH}`);
    assert.equal(received.headers?.["clerk-secret-key"], "test-only-placeholder");
    assert.equal(received.headers?.["x-forwarded-for"], "192.0.2.10");
    assert.equal(received.headers?.cookie, "test_session=example");
    assert.equal(received.headers?.host, new URL(target).host);
    assert.equal(response.status, 201);
    assert.equal(response.body.toString(), '{"ok":true}');
    assert.equal(Number(response.headers["content-length"]), response.body.length);
    assert.deepEqual(response.headers["set-cookie"], ["one=1; HttpOnly", "two=2; Secure"]);
    assert.equal(response.headers["clerk-secret-key"], undefined);
  } finally {
    await close(server);
    await close(upstream);
  }
});

test("Clerk transport preserves compressed bytes and bodyless responses", async () => {
  const payload = gzipSync('{"message":"compressed response"}');
  const upstream = createServer((req, res) => {
    if (req.url === "/empty") { res.writeHead(204); res.end(); return; }
    if (req.url === "/cached") { res.writeHead(304); res.end(); return; }
    res.writeHead(200, { "content-encoding": "gzip", "content-length": payload.length });
    res.end(req.method === "HEAD" ? undefined : payload);
  });
  const app = express();
  app.use(CLERK_PROXY_PATH, createClerkProxy("test-only-placeholder", await listen(upstream)));
  const server = createServer(app);
  const origin = await listen(server);
  try {
    const compressed = await send(`${origin}${CLERK_PROXY_PATH}/compressed`);
    assert.deepEqual(compressed.body, payload);
    assert.equal(compressed.headers["content-encoding"], "gzip");
    for (const [path, method, status] of [["/empty", "GET", 204], ["/cached", "GET", 304], ["/compressed", "HEAD", 200]] as const) {
      const response = await send(`${origin}${CLERK_PROXY_PATH}${path}`, method);
      assert.equal(response.status, status);
      assert.equal(response.body.length, 0);
    }
  } finally {
    await close(server);
    await close(upstream);
  }
});

test("Clerk transport returns a clean 502 when the upstream is unreachable", async () => {
  const upstream = createServer();
  const target = await listen(upstream);
  await close(upstream);
  const app = express();
  app.use(CLERK_PROXY_PATH, createClerkProxy("test-only-placeholder", target));
  const server = createServer(app);
  try {
    const response = await send(`${await listen(server)}${CLERK_PROXY_PATH}/v1/client`);
    assert.equal(response.status, 502);
    assert.equal(response.body.length, 0);
  } finally { await close(server); }
});
