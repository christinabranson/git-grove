const http = require("http");
const port = process.env.WEB_PORT ?? 3000;
http
  .createServer((_, res) => res.end("node-basic running\n"))
  .listen(port, () => console.log(`listening on ${port}`));
