const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { jwtSecret, jwtExpiresIn } = require('../config');
const { authenticate } = require('../middleware/auth');
const { recordAudit } = require('../services/audit');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const result = await db.query('SELECT id, full_name, email, password_hash, role, active FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect credentials.' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.full_name }, jwtSecret, { expiresIn: jwtExpiresIn });
    await recordAudit(user.id, 'login', 'user', user.id, {});
    res.json({ token, tokenType: 'Bearer', expiresIn: jwtExpiresIn, user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role } });
  } catch (error) { next(error); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await db.query('SELECT id, full_name, email, role, active FROM users WHERE id=$1', [req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
    const u = result.rows[0];
    res.json({ id: u.id, fullName: u.full_name, email: u.email, role: u.role, active: u.active });
  } catch (error) { next(error); }
});

module.exports = router;
