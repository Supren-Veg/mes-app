import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { fmtDate } from '../utils/format';

const statusColor = {
  'Concluído':    'bg-success-soft text-success',
  'Em Andamento': 'bg-info-soft text-info',
  'Pendente':     'bg-warn-soft text-warn',
  'Cancelado':    'bg-danger-soft text-destructive',
};

function fmt(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMin(m) {
  if (m == null) return '—';
  const h   = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min}min` : `${min}min`;
}

export default function OrderDetail() {
  const { id } = useParams();
  const { data: order, loading } = useApi(`/orders/${id}`);

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>;
  if (!order)  return <p className="text-sm text-destructive py-8 text-center">Ordem não encontrada.</p>;

  const totalPauseMin = (order.steps || []).reduce((acc, s) =>
    acc + (s.pauses || []).reduce((a, p) => a + (p.duration_minutes || 0), 0), 0);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/orders" className="text-sm text-muted-foreground hover:text-muted-foreground">← Ordens</Link>
        <h1 className="text-xl font-bold text-muted-foreground">{order.product_name}</h1>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[order.status] || 'bg-muted text-muted-foreground'}`}>
          {order.status}
        </span>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Data',              value: fmtDate(order.production_date) },
          { label: 'Usuário',           value: order.operator_name || '—' },
          { label: 'Planejado',         value: order.planned_qty  != null ? `${order.planned_qty} ${order.unit}`  : '—' },
          { label: 'Produzido',         value: order.produced_qty != null ? `${order.produced_qty} ${order.unit}` : '—' },
          { label: 'Eficiência',        value: order.efficiency_pct != null ? `${order.efficiency_pct}%` : '—',
            color: order.efficiency_pct >= 100 ? 'text-success' : order.efficiency_pct >= 80 ? 'text-warn' : order.efficiency_pct != null ? 'text-destructive' : '' },
          { label: 'Etapas',            value: (order.steps || []).length },
          { label: 'Total em pausas',   value: fmtMin(totalPauseMin) },
          { label: 'Observações',       value: order.notes || '—' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
            <p className={`text-base font-semibold text-muted-foreground mt-0.5 ${kpi.color || ''}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Etapas */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-muted-foreground">Etapas ({(order.steps || []).length})</h2>
        </div>

        {(order.steps || []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma etapa registrada.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {order.steps.map(step => (
              <div key={step.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                  <span className="text-sm font-medium text-muted-foreground w-44">{step.stage_name}</span>
                  <span className="text-xs text-muted-foreground">Início: {fmt(step.started_at)}</span>
                  <span className="text-xs text-muted-foreground">Fim: {fmt(step.finished_at)}</span>
                  <span className="text-xs text-muted-foreground">Bruto: <strong>{fmtMin(step.gross_time_minutes)}</strong></span>
                  <span className="text-xs text-muted-foreground">Líquido: <strong className="text-brand-700">{fmtMin(step.net_time_minutes)}</strong></span>
                  {(step.pauses || []).length > 0 && (
                    <span className="text-xs text-warn">
                      {step.pauses.length} pausa(s) · {fmtMin(step.pauses.reduce((a, p) => a + (p.duration_minutes || 0), 0))}
                    </span>
                  )}
                  {step.is_legacy ? <span className="text-xs text-warn ml-auto">★ histórico</span> : null}
                </div>

                {(step.pauses || []).length > 0 && (
                  <div className="mt-2 ml-4 space-y-1">
                    {step.pauses.map((p, pi) => (
                      <div key={pi} className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground bg-warn-soft rounded px-3 py-1.5">
                        <span>Pausa {pi + 1}</span>
                        <span>Início: {fmt(p.paused_at)}</span>
                        <span>Retorno: {fmt(p.resumed_at)}</span>
                        <span>Duração: <strong>{fmtMin(p.duration_minutes)}</strong></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
