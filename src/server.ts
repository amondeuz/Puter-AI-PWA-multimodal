import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { createRouter } from './routes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from project root
app.use(express.static(path.join(__dirname, '..')));

// Mount API routes
app.use(createRouter());

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           TURBO CONSOLE API SERVER                        ║
╠═══════════════════════════════════════════════════════════╣
║  Status: RUNNING                                          ║
║  Port: ${PORT}                                               ║
║  Endpoints:                                               ║
║    - GET  /api (API documentation)                        ║
║    - GET  /models (list models)                           ║
║    - POST /suggest-models (get suggestions)               ║
║    - POST /run (execute inference)                        ║
║    - GET  /health (health check)                          ║
╚═══════════════════════════════════════════════════════════╝

Machine-facing API helper for Pinokio routing.
Visit http://localhost:${PORT}/api for API documentation.
`);
});

export default app;
