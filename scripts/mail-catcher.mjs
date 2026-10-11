// Local-only email transport for real magic-link browser tests. Never deployed.
import { createServer } from "node:http";
const inbox = new Map();
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  const url = new URL(request.url, "http://127.0.0.1:8025");
  if (request.method === "POST" && url.pathname === "/send") {
    let body = "";
    for await (const part of request) {
      body += part;
      if (body.length > 4096) {
        response.writeHead(413);
        response.end("{}");
        return;
      }
    }
    const mail = JSON.parse(body);
    inbox.set(mail.email, mail.url);
    response.end('{"ok":true}');
  } else if (request.method === "GET" && url.pathname === "/mail") {
    response.end(
      JSON.stringify({ url: inbox.get(url.searchParams.get("email")) || null }),
    );
  } else {
    response.writeHead(404);
    response.end("{}");
  }
});
server.listen(8025, "127.0.0.1", () =>
  console.log("AllTing local test mailbox: http://127.0.0.1:8025"),
);
