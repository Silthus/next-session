let welcomeAttempts = 0;
const log: string[] = [];
Bun.serve({
  port: 3499,
  hostname: "127.0.0.1",
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const body = await request.text();
    const auth = request.headers.get("authorization");
    const status = path === "/welcome" && ++welcomeAttempts === 1 ? 503 : 200;
    const line = `${new Date().toISOString()} ${request.method} ${path} -> ${status} auth=${auth === "Bearer local-proof-secret" ? "ok" : auth} body=${body}`;
    log.push(line);
    console.log(line);
    return new Response(null, { status });
  },
});
console.log("webhook listening on 3499");
