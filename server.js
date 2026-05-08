import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Real-time Walkie Talkie signaling logic
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-channel', (channelId) => {
      socket.join(channelId);
      console.log(`User ${socket.id} joined channel: ${channelId}`);
    });

    socket.on('ptt-start', ({ channelId, userId }) => {
      socket.to(channelId).emit('user-transmitting', { userId, status: 'start' });
    });

    socket.on('ptt-stop', ({ channelId, userId }) => {
      socket.to(channelId).emit('user-transmitting', { userId, status: 'stop' });
    });

    socket.on('audio-data', ({ channelId, data }) => {
      socket.to(channelId).emit('remote-audio', { data });
    });

    socket.on('sos-beacon', ({ channelId, userId, location }) => {
      socket.to(channelId).emit('sos-alert', { userId, location, timestamp: Date.now() });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  // Radar Beacon for Network Scanner
  app.get('/api/ping', (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.json({ service: 'aegis-tactical', status: 'active' });
  });

  // Phaser Code Tunnel Generator
  let currentTunnel = null;
  app.post('/api/tunnel', express.json(), async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });
    
    if (currentTunnel) {
      currentTunnel.close();
    }
    
    try {
      const localtunnel = (await import('localtunnel')).default;
      currentTunnel = await localtunnel({ port: PORT, subdomain: `aegis-tac-${code.toLowerCase()}` });
      res.json({ url: currentTunnel.url });
    } catch (err) {
      console.error('Tunnel error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Serve public assets
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production' && !process.env.SKIP_VITE) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      
      app.get('*', async (req, res, next) => {
        if (req.path === '/download.html') {
          res.sendFile(path.join(process.cwd(), 'public', 'download.html'));
          return;
        }
        next();
      });
    } catch (e) {
      console.error('Vite middleware failed:', e);
    }
  }

  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  
  app.get('/download.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'download.html'));
  });

  app.get('*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (require('fs').existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Application not built. Please run npm run build.');
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Aegis Server running on http://localhost:${PORT}`);
  });
}

startServer();
