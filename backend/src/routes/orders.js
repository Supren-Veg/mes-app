const { Router } = require('express');
const orderRepository = require('../repositories/orderRepository');
const { requireNonGuest } = require('../middleware/auth');
const { createOrderSchema, updateOrderSchema, updateStepSchema, validate } = require('../lib/schemas');
const router = Router();

// GET /steps?date=YYYY-MM-DD — todos os steps do dia (visão planilha)
router.get('/steps', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date é obrigatório' });
  res.json(orderRepository.findStepsByDate(date));
});

// PUT /steps/:stepId — editar step
router.put('/steps/:stepId', requireNonGuest, (req, res) => {
  const data = validate(updateStepSchema, req.body, res);
  if (!data) return;
  const updated = orderRepository.updateStep(req.params.stepId, data);
  if (!updated) return res.status(404).json({ error: 'Step não encontrado' });
  res.json(updated);
});

// DELETE /steps/:stepId — excluir step
router.delete('/steps/:stepId', requireNonGuest, (req, res) => {
  orderRepository.deleteStep(req.params.stepId);
  res.json({ ok: true });
});

router.get('/', (req, res) => {
  const { date_from, date_to, product_id, operator_id, status } = req.query;
  res.json(orderRepository.findAll({ date_from, date_to, product_id, operator_id, status }));
});

router.get('/:id', (req, res) => {
  const order = orderRepository.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Ordem não encontrada' });
  res.json(order);
});

router.post('/', requireNonGuest, (req, res) => {
  const data = validate(createOrderSchema, req.body, res);
  if (!data) return;
  res.status(201).json(orderRepository.create(data));
});

router.put('/:id', requireNonGuest, (req, res) => {
  const data = validate(updateOrderSchema, req.body, res);
  if (!data) return;
  res.json(orderRepository.update(req.params.id, data));
});

router.delete('/:id', requireNonGuest, (req, res) => {
  orderRepository.delete(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/steps', requireNonGuest, (req, res) => {
  const { stage_id, started_at, finished_at, notes } = req.body;
  if (!stage_id) return res.status(400).json({ error: 'stage_id é obrigatório' });
  res.status(201).json(orderRepository.addStep(req.params.id, { stage_id, started_at, finished_at, notes }));
});

router.post('/steps/:stepId/pauses', requireNonGuest, (req, res) => {
  const { paused_at, resumed_at, reason } = req.body;
  if (!paused_at) return res.status(400).json({ error: 'paused_at é obrigatório' });
  res.status(201).json(orderRepository.addPause(req.params.stepId, { paused_at, resumed_at, reason }));
});

module.exports = router;
