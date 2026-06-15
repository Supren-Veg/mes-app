require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');

const productsRouter     = require('./routes/products');
const operatorsRouter    = require('./routes/operators');
const stagesRouter       = require('./routes/stages');
const ordersRouter       = require('./routes/orders');
const dashboardRouter    = require('./routes/dashboard');
const authRouter         = require('./routes/auth');
const stageTargetsRouter = require('./routes/stageTargets');
const syncRouter         = require('./routes/sync');
const { authMiddleware } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// CORS: em produção o frontend é servido pelo mesmo servidor (sem necessidade de CORS)
// Em dev, libera localhost:5173
app.use(cors({
  origin: isProd
    ? false
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));

app.use(express.json());

// Permite embedding via iframe no portal unificado
// FRAME_ORIGINS: origens extras separadas por espaço (configurar no Railway)
const extraOrigins = process.env.FRAME_ORIGINS ?? ''
const FRAME_ANCESTORS_CSP = `frame-ancestors 'self' https://gestao-supren.vercel.app https://app.suprenveg.com.br https://*.up.railway.app${extraOrigins ? ' ' + extraOrigins : ''}`;
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', FRAME_ANCESTORS_CSP);
  res.removeHeader('X-Frame-Options');
  next();
});

// Rotas públicas
app.use('/api/auth', authRouter);

// Rotas protegidas por JWT
app.use('/api/products',      authMiddleware, productsRouter);
app.use('/api/operators',     authMiddleware, operatorsRouter);
app.use('/api/stages',        authMiddleware, stagesRouter);
app.use('/api/orders',        authMiddleware, ordersRouter);
app.use('/api/dashboard',     authMiddleware, dashboardRouter);
app.use('/api/stage-targets', authMiddleware, stageTargetsRouter);
app.use('/api/sync',         authMiddleware, syncRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Serve frontend estático em produção
// __dirname = mes-app/backend/src → ../../frontend/dist = mes-app/frontend/dist
const DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, {
    setHeaders: (res) => {
      res.setHeader('Content-Security-Policy', FRAME_ANCESTORS_CSP);
      res.removeHeader('X-Frame-Options');
    },
  }));
  app.get('*', (_, res) => {
    res.setHeader('Content-Security-Policy', FRAME_ANCESTORS_CSP);
    res.removeHeader('X-Frame-Options');
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else if (isProd) {
  console.warn(`AVISO: diretório de build não encontrado em ${DIST}`);
}

// Handler de erros global
app.use((err, _req, res, _next) => {
  console.error(err.stack || err);
  res.status(500).json({ error: err.message || 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`MES API rodando em http://localhost:${PORT} [${isProd ? 'produção' : 'desenvolvimento'}]`);

  // Cron: sync Fácil123 a cada hora + ao iniciar
  if (process.env.FACIL123_EMAIL && process.env.FACIL123_SENHA) {
    const cron = require('node-cron');
    const { runSync } = require('./services/facil123Sync');
    cron.schedule('0 * * * *', () => {
      console.log('[cron] Iniciando sync horário Fácil123...');
      runSync().catch(e => console.error('[cron] Erro no sync:', e.message));
    });
    console.log('[cron] Sync Fácil123 agendado a cada hora.');
    // Sync imediato ao iniciar (aguarda 10s para o servidor estabilizar)
    setTimeout(() => {
      console.log('[cron] Sync inicial ao subir o servidor...');
      runSync().catch(e => console.error('[cron] Erro no sync inicial:', e.message));
    }, 10000);
  } else {
    console.log('[cron] FACIL123_EMAIL/SENHA não configurados — sync desativado.');
  }
});
