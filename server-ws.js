const http = require('http');
const { Server } = require('socket.io');

const PORT = 3001;

// Buat HTTP server sederhana untuk menerima POST dari Next.js API
const server = http.createServer((req, res) => {
  // Setup CORS untuk endpoint HTTP
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/emit') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data && data.eventName) {
          console.log(`📣 [HTTP POST] Meneruskan event: ${data.eventName}`);
          io.emit(data.eventName, data.payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, message: 'Invalid payload' }));
        }
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Tempelkan Socket.io ke HTTP server yang sama
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`🔗 Client terhubung: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`❌ Client terputus: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 WebSocket & HTTP Server berjalan di port ${PORT}\n`);
});
