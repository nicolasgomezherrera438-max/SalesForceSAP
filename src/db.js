const { Pool } = require('pg');
const { databaseUrl } = require('./config');

const pool = new Pool({ connectionString: databaseUrl, max: 15, idleTimeoutMillis: 30000 });
pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};
