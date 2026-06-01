const { Router } = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const operatorRepository = require('../repositories/operatorRepository');
const { authMiddleware } = require('../middleware/auth');
const { JWT_SECRET } = require('../config');
const { loginSchema, changePasswordSchema, validate } = require('../lib/schemas');

const router = Router();

// Limita tentativas de login: máximo 10 por IP a cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});

// Limita geração de guest-token: máximo 30 por IP a cada hora
const guestTokenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de tokens de convidado atingido. Aguarde.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
  const data = validate(loginSchema, req.body, res);
  if (!data) return;
  const { email, password } = data;

  const user = operatorRepository.findByEmail(email.toLowerCase().trim());
  if (!user || !user.password_hash)
    return res.status(401).json({ error: 'Credenciais inválidas.' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid)
    return res.status(401).json({ error: 'Credenciais inválidas.' });

  const role = user.role || 'conferente';
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role },
    password_change_required: user.password_change_required === 1,
  });
});

// GET /api/auth/guest-token  (público)
router.get('/guest-token', guestTokenLimiter, (req, res) => {
  const token = jwt.sign(
    { id: 0, name: 'Convidado', role: 'guest' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ token, user: { id: 0, name: 'Convidado', role: 'guest' } });
});

// GET /api/auth/me  (autenticado) — retorna dados frescos do banco
router.get('/me', authMiddleware, (req, res) => {
  if (req.user.role === 'guest') {
    return res.json({ id: 0, name: 'Convidado', email: null, role: 'guest' });
  }
  const user = operatorRepository.findPublicById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json(user);
});

// POST /api/auth/change-password  (autenticado)
router.post('/change-password', authMiddleware, (req, res) => {
  const data = validate(changePasswordSchema, req.body, res);
  if (!data) return;
  const { password } = data;

  const hash = bcrypt.hashSync(password, 10);
  operatorRepository.changePassword(req.user.id, hash);

  res.json({ ok: true });
});

module.exports = router;
