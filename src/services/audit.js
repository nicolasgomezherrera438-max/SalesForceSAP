const db = require('../db');

async function recordAudit(userId, action, entityType, entityId, details = {}) {
  await db.query(
    'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
    [userId || null, action, entityType || null, entityId || null, JSON.stringify(details)]
  );
}

module.exports = { recordAudit };
