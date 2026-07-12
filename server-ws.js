const http = require('http');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const EVENT_SECRET = process.env.EVENT_SECRET || process.env.WS_EVENT_SECRET || '';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://pos.ptslu.cloud',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const parseAllowedOrigins = () => {
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];

  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins])];
};

const allowedOrigins = parseAllowedOrigins();

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
};

const applyCorsHeaders = (req, res) => {
  const origin = req.headers.origin;

  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || allowedOrigins[0]);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const isAuthorizedRequest = (req) => {
  if (!EVENT_SECRET) {
    console.warn('[HTTP POST] EVENT_SECRET/WS_EVENT_SECRET belum dikonfigurasi.');
    return false;
  }

  const authHeader = req.headers.authorization || '';
  const expectedHeader = `Bearer ${EVENT_SECRET}`;
  return authHeader === expectedHeader;
};

const server = http.createServer((req, res) => {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'POST' && req.url === '/emit') {
    if (!isAuthorizedRequest(req)) {
      sendJson(res, 401, { success: false, message: 'Unauthorized' });
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data && data.eventName) {
          console.log(`[HTTP POST] Meneruskan event: ${data.eventName}`);
          io.emit(data.eventName, data.payload);
          sendJson(res, 200, { success: true });
        } else {
          sendJson(res, 400, { success: false, message: 'Invalid payload' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sendJson(res, 500, { success: false, error: message });
      }
    });

    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket] Client terhubung: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket] Client terputus: ${socket.id}`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`WebSocket & HTTP Server berjalan di ${HOST}:${PORT}`);
});
