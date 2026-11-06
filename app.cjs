const http = require('node:http');
const next = require('next');

const app = next({ dev: false });
const handle = app.getRequestHandler();
const port = Number(process.env.PORT || 3000);

app.prepare()
  .then(() => {
    const server = http.createServer((request, response) => {
      handle(request, response);
    });

    server.listen(port, () => {
      console.log(`HUIT ContestFlow listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start HUIT ContestFlow:', error);
    process.exit(1);
  });
