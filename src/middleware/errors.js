function notFound(_req, res) {
  res.status(404).json({ error: 'Endpoint not found.' });
}

function errorHandler(error, _req, res, _next) {
  console.error(error.stack || error.message || error);
  if (error.code === '23505') return res.status(409).json({ error: 'A record with this unique value already exists.' });
  if (error.code === '23503') return res.status(400).json({ error: 'A referenced record does not exist.' });
  if (error.code === '22P02') return res.status(400).json({ error: 'Invalid ID or field format.' });
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error.' });
}

module.exports = { notFound, errorHandler };
