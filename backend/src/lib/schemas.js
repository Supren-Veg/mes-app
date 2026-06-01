const { z } = require('zod');

const passwordRule = z
  .string()
  .min(8, 'A senha deve ter no mínimo 8 caracteres.')
  .refine(v => /[a-zA-Z]/.test(v), 'A senha deve conter ao menos uma letra.')
  .refine(v => /[0-9]/.test(v), 'A senha deve conter ao menos um número.');

const loginSchema = z.object({
  email:    z.string().min(1, 'Email é obrigatório.').email('Email inválido.'),
  password: z.string().min(1, 'Senha é obrigatória.'),
});

const changePasswordSchema = z.object({
  password: passwordRule,
});

const createOperatorSchema = z.object({
  name:        z.string().min(1, 'name é obrigatório.'),
  email:       z.string().email('Email inválido.').optional().or(z.literal('')).transform(v => v || null),
  external_id: z.string().optional(),
});

const updateOperatorSchema = z.object({
  name:        z.string().min(1).optional(),
  active:      z.number().int().min(0).max(1).optional(),
  external_id: z.string().optional(),
  role:        z.enum(['admin', 'conferente', 'producao']).optional(),
  email:       z.string().email('Email inválido.').optional().or(z.literal('')).transform(v => v || null),
});

const createOrderSchema = z.object({
  product_id:      z.number().int().positive('product_id é obrigatório.'),
  production_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'production_date deve ser YYYY-MM-DD.'),
  operator_id:     z.number().int().positive().optional().nullable(),
  planned_qty:     z.number().positive().optional().nullable(),
  notes:           z.string().optional(),
});

const updateOrderSchema = z.object({
  status:          z.enum(['Pendente', 'Em Andamento', 'Concluído', 'Cancelado']).optional(),
  produced_qty:    z.number().min(0).optional().nullable(),
  planned_qty:     z.number().positive().optional().nullable(),
  notes:           z.string().optional(),
  product_id:      z.number().int().positive().optional(),
  operator_id:     z.number().int().positive().optional().nullable(),
  production_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateStepSchema = z.object({
  stage_id:    z.number().int().positive().optional(),
  started_at:  z.string().optional().nullable(),
  finished_at: z.string().optional().nullable(),
});

function validate(schema, body, res) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.errors[0]?.message ?? 'Dados inválidos.';
    res.status(400).json({ error: message });
    return null;
  }
  return result.data;
}

module.exports = {
  loginSchema,
  changePasswordSchema,
  createOperatorSchema,
  updateOperatorSchema,
  createOrderSchema,
  updateOrderSchema,
  updateStepSchema,
  validate,
};
