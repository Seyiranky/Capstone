const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
const io = initSocket(server);

// Make the Socket.IO instance reachable from controllers via req.app.get('io').
app.set('io', io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Isoko Talents API listening on port ${PORT}`);
});
