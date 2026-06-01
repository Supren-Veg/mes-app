const { Router }  = require('express');
const bcrypt       = require('bcryptjs');
const { generateTempPassword, sendTempPasswordEmail } = require('../services/emailService');
const operatorRepository = require('../repositories/operatorRepository');
const { adminMiddleware } = require('../middleware/auth');
const { createOperatorSchema, updateOperatorSchema, validate } = require('../lib/schemas');

const router = Router();

router.get('/', (req, res) => {
  const all = operatorRepository.findAll();
  // Não-admin recebe apenas id+name (suficiente para selects de filtro/formulário)
  if (req.user?.role !== 'admin') {
    return res.json(all.map(({ id, name, active }) => ({ id, name, active })));
  }
  res.json(all);
});

router.post('/', adminMiddleware, async (req, res) => {
  const data = validate(createOperatorSchema, req.body, res);
  if (!data) return;
  const { name, email, external_id } = data;

  let passwordHash = null;
  let tempPassword = null;

  if (email) {
    tempPassword = generateTempPassword();
    passwordHash = bcrypt.hashSync(tempPassword, 10);
  }

  const created = operatorRepository.create({ name, email, passwordHash, external_id });

  let emailSent = false;
  if (email && tempPassword) {
    emailSent = await sendTempPasswordEmail(email, name, tempPassword).catch(err => {
      console.error('Erro ao enviar email:', err.message);
      return false;
    });
  }

  res.status(201).json({ ...created, emailSent });
});

router.put('/:id', adminMiddleware, (req, res) => {
  const data = validate(updateOperatorSchema, req.body, res);
  if (!data) return;
  const { name, active, external_id, role, email } = data;
  const target = operatorRepository.findRoleById(req.params.id);
  const VALID_ROLES = ['admin', 'conferente', 'producao'];
  const newRole = VALID_ROLES.includes(role) ? role : null;
  if (newRole !== 'admin' && target?.role === 'admin' && Number(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Você não pode remover sua própria permissão de admin.' });

  const fields = { name, active, external_id, role: newRole };
  if ('email' in data) fields.email = email;

  res.json(operatorRepository.update(req.params.id, fields));
});

router.post('/:id/reset-password', adminMiddleware, async (req, res) => {
  const op = operatorRepository.findByIdFull(req.params.id);
  if (!op) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const tempPassword = generateTempPassword();
  const passwordHash = bcrypt.hashSync(tempPassword, 10);
  operatorRepository.updatePassword(req.params.id, passwordHash);

  let emailSent = false;
  if (op.email) {
    emailSent = await sendTempPasswordEmail(op.email, op.name, tempPassword).catch(err => {
      console.error('Erro ao enviar email:', err.message);
      return false;
    });
  }

  // Retorna a senha temporária apenas quando o email falha — somente admins chegam aqui
  res.json({ emailSent, tempPassword: emailSent ? null : tempPassword });
});

module.exports = router;
