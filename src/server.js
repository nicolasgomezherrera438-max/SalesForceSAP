const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const path = require('path');
const db = require('./db');
const authRoutes = require('./routes/auth.routes');
const apiRoutes = require('./routes/api.routes');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map(s => s.trim()), credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));
app.get('/api', (_req, res) => res.json({ name: 'SalesForceSAP Backend', version: '1.0.0', status: 'running', health: '/api/health' }));
app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (_error) {
    res.status(503).json({ status: 'degraded', database: 'disconnected' });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(config.port, () => console.log(`SalesForceSAP API listening on port ${config.port}`));

async function shutdown() {
  server.close(async () => {
    await db.pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
