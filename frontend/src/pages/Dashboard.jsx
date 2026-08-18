import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { useApi } from '../hooks/useApi';
import GanttChart from '../components/GanttChart';
import { fmtDateShort } from '../utils/format';
import { STAGE_COLORS } from '../utils/colors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CalendarClock, CheckCircle2 } from 'lucide-react';

const today    = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

const CHART_BG    = 'transparent';
const GRID_COLOR  = 'hsl(220 12% 22%)';
const TEXT_COLOR  = 'hsl(220 8% 58%)';
const GREEN       = 'hsl(142 60% 55%)';
const BLUE        = 'hsl(213 94% 68%)';
const AMBER       = 'hsl(38 92% 55%)';

function ChartCard({ title, subtitle, children, className }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const STATUS_VARIANT = { 'Pendente': 'warning', 'Em Andamento': 'default', 'Concluído': 'success' };

export default function Dashboard() {
  const [from,       setFrom]       = useState(monthAgo);
  const [to,         setTo]         = useState(today);
  const [operatorId, setOperatorId] = useState('');

  const { data: operators } = useApi('/operators');

  // Ordens de hoje (Pendente + Em Andamento)
  const { data: todayOrders } = useApi(`/orders?date_from=${today}&date_to=${today}&status=Pendente,Em+Andamento`);

  const qs = `?date_from=${from}&date_to=${to}${operatorId ? `&operator_id=${operatorId}` : ''}`;

  const { data: summary        } = useApi(`/dashboard/summary${qs}`,           [from, to, operatorId]);
  const { data: summaryPrev    } = useApi(`/dashboard/summary-prev${qs}`,      [from, to, operatorId]);
  const { data: byStage        } = useApi(`/dashboard/by-stage${qs}`,          [from, to]);
  const { data: daily          } = useApi(`/dashboard/daily${qs}`,             [from, to]);
  const { data: timeline       } = useApi(`/dashboard/timeline${qs}`,          [from, to]);
  const { data: eff            } = useApi(`/dashboard/efficiency${qs}`,        [from, to]);
  const { data: byProductStage } = useApi(`/dashboard/by-product-stage${qs}`,  [from, to]);
  const { data: pauses         } = useApi(`/dashboard/pauses${qs}`,            [from, to, operatorId]);
  const { data: stageTargets   } = useApi('/stage-targets');

  const targetCompareData = useMemo(() => {
    if (!byStage || !stageTargets?.length) return [];
    return (stageTargets || [])
      .map(t => {
        const real = (byStage || []).find(s => s.stage === t.stage_name);
        if (!real) return null;
        return { name: t.stage_name, real: real.avg_net_minutes, meta: t.target_minutes };
      })
      .filter(Boolean);
  }, [byStage, stageTargets]);

  const pauseData = (pauses || [])
    .slice(0, 12)
    .map(r => ({ name: r.reason, minutos: r.total_minutes, ocorrencias: r.occurrences }));

  const targetMap = useMemo(() => {
    const m = {};
    for (const t of stageTargets || []) m[t.stage_name] = t.target_minutes;
    return m;
  }, [stageTargets]);

  const stageData = (byStage || [])
    .filter(r => !r.is_legacy)
    .slice(0, 15)
    .map(r => ({ name: r.stage, minutos: r.total_net_minutes, ocorrencias: r.occurrences, meta: targetMap[r.stage] ?? null }));

  const effData = (eff || [])
    .filter(r => r.avg_efficiency_pct != null)
    .slice(0, 12)
    .map(r => ({ name: r.product, eficiencia: r.avg_efficiency_pct }));

  const allStages = useMemo(() => {
    if (!byProductStage) return [];
    const seen = new Set();
    for (const p of byProductStage)
      for (const s of p.stages)
        if (!s.is_legacy) seen.add(s.stage);
    return [...seen];
  }, [byProductStage]);

  const productStageData = useMemo(() => {
    if (!byProductStage) return [];
    return byProductStage.map(p => {
      const row = { name: p.product };
      for (const s of p.stages)
        if (!s.is_legacy) row[s.stage] = s.avg_net_minutes;
      return row;
    });
  }, [byProductStage]);

  const productStageTotalData = useMemo(() => {
    if (!byProductStage) return [];
    return byProductStage.map(p => {
      const row = { name: p.product };
      for (const s of p.stages)
        if (!s.is_legacy) row[s.stage] = s.total_net_minutes;
      return row;
    });
  }, [byProductStage]);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Período:</span>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" />
            <span className="text-muted-foreground">→</span>
            <Input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="w-36" />
            <select
              value={operatorId}
              onChange={e => setOperatorId(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todos os usuários</option>
              {(operators || []).map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Ordens de Hoje */}
      {todayOrders != null && (
        <Card className={todayOrders.length > 0 ? 'border-l-4 border-l-primary' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-foreground">
                  Ordens de Hoje — {new Date(today + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </CardTitle>
              </div>
              <Badge variant="secondary">{todayOrders.length} {todayOrders.length === 1 ? 'ordem' : 'ordens'}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {todayOrders.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <CheckCircle2 className="size-4 opacity-50" />
                Nenhuma ordem pendente para hoje.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {todayOrders.map(order => (
                  <Link
                    key={order.id}
                    to={`/orders/${order.id}`}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 hover:bg-muted/60 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{order.product_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.planned_qty != null ? `${order.planned_qty} ${order.unit}` : 'Sem qtd'}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[order.status] ?? 'outline'} className="text-[10px] shrink-0 mt-0.5">
                      {order.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Ordens',          value: summary.total_orders,          prev: summaryPrev?.total_orders },
            { label: 'Produtos',        value: summary.total_products,        prev: summaryPrev?.total_products },
            { label: 'Total Planejado', value: `${summary.total_planned ?? 0} kg`,  prev: summaryPrev?.total_planned,  raw: summary.total_planned },
            { label: 'Total Produzido', value: `${summary.total_produced ?? 0} kg`, prev: summaryPrev?.total_produced, raw: summary.total_produced },
            { label: 'Eficiência Média',value: `${summary.avg_efficiency_pct ?? '—'}%`,
              prev: summaryPrev?.avg_efficiency_pct, raw: summary.avg_efficiency_pct,
              highlight: summary.avg_efficiency_pct >= 100 },
          ].map(kpi => {
            const cur   = kpi.raw  ?? kpi.value;
            const prev  = kpi.prev ?? null;
            const delta = (prev != null && cur != null && typeof cur === 'number' && typeof prev === 'number' && prev !== 0)
              ? Math.round((cur - prev) / prev * 100)
              : null;
            return (
              <Card key={kpi.label} className={cn(kpi.highlight && 'border-l-4 border-l-primary')}>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
                  {delta !== null && (
                    <p className={cn('text-xs font-medium mt-1', delta >= 0 ? 'text-primary' : 'text-destructive')}>
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs período anterior
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Gráficos — linha 1 */}
      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title="Tempo Total por Etapa (min)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stageData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
              <XAxis type="number" tick={{ fontSize: 11, fill: TEXT_COLOR }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: TEXT_COLOR }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(220 12% 14%)', border: '1px solid hsl(220 12% 20%)', borderRadius: 8 }} formatter={v => [`${v} min`]} />
              <Bar dataKey="minutos" fill={GREEN} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Eficiência por Produto (%)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={effData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
              <XAxis type="number" domain={[0, 150]} tick={{ fontSize: 11, fill: TEXT_COLOR }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: TEXT_COLOR }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(220 12% 14%)', border: '1px solid hsl(220 12% 20%)', borderRadius: 8 }} formatter={v => [`${v}%`]} />
              <Bar dataKey="eficiencia" fill={BLUE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Pausas */}
      {pauseData.length > 0 && (
        <ChartCard title="Pausas por Motivo (min total)">
          <ResponsiveContainer width="100%" height={Math.max(200, pauseData.length * 32)}>
            <BarChart data={pauseData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
              <XAxis type="number" tick={{ fontSize: 11, fill: TEXT_COLOR }} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11, fill: TEXT_COLOR }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(220 12% 14%)', border: '1px solid hsl(220 12% 20%)', borderRadius: 8 }} formatter={(v, name) => [name === 'minutos' ? `${v} min` : v, name === 'minutos' ? 'Total' : 'Ocorrências']} />
              <Bar dataKey="minutos" fill={AMBER} radius={[0, 4, 4, 0]}
                label={{ position: 'right', fontSize: 10, fill: TEXT_COLOR, formatter: v => `${v}min` }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Etapas por produto — média */}
      {productStageData.length > 0 && (
        <ChartCard title="Tempo Médio por Etapa / Produto (min)">
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: Math.max(700, productStageData.length * 72) }}>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={productStageData} margin={{ top: 5, right: 20, left: 0, bottom: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, angle: -45, textAnchor: 'end', fill: TEXT_COLOR }} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: TEXT_COLOR }} tickFormatter={v => `${v}min`} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220 12% 14%)', border: '1px solid hsl(220 12% 20%)', borderRadius: 8 }} formatter={(v, name) => [`${v} min`, name]} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 12 }} />
                  {allStages.map((stage, i) => (
                    <Bar key={stage} dataKey={stage} stackId="a" fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>
      )}

      {/* Etapas por produto — total */}
      {productStageTotalData.length > 0 && (
        <ChartCard title="Tempo Total por Etapa / Produto (min)">
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: Math.max(700, productStageTotalData.length * 72) }}>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={productStageTotalData} margin={{ top: 5, right: 20, left: 0, bottom: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, angle: -45, textAnchor: 'end', fill: TEXT_COLOR }} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: TEXT_COLOR }} tickFormatter={v => `${v}min`} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(220 12% 14%)', border: '1px solid hsl(220 12% 20%)', borderRadius: 8 }} formatter={(v, name) => [`${v} min`, name]} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 12 }} />
                  {allStages.map((stage, i) => (
                    <Bar key={stage} dataKey={stage} stackId="a" fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>
      )}

      {/* Metas vs Real */}
      {targetCompareData.length > 0 && (
        <ChartCard title="Metas vs Tempo Médio Real (min/ocorrência)" subtitle="Apenas etapas com meta cadastrada.">
          <ResponsiveContainer width="100%" height={Math.max(180, targetCompareData.length * 48)}>
            <BarChart data={targetCompareData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
              <XAxis type="number" tick={{ fontSize: 11, fill: TEXT_COLOR }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: TEXT_COLOR }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(220 12% 14%)', border: '1px solid hsl(220 12% 20%)', borderRadius: 8 }} formatter={(v, name) => [`${v} min`, name === 'real' ? 'Média real' : 'Meta']} />
              <Legend formatter={n => n === 'real' ? 'Média real' : 'Meta'} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="meta" fill="hsl(142 60% 55% / 20%)" stroke={GREEN} strokeWidth={1} radius={[0, 4, 4, 0]} />
              <Bar dataKey="real" fill={BLUE} radius={[0, 4, 4, 0]}
                label={{ position: 'right', fontSize: 10, fill: TEXT_COLOR, formatter: v => `${v}min` }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Produção diária */}
      {daily && daily.length > 0 && (
        <ChartCard title="Produção Diária (kg)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: TEXT_COLOR }} tickFormatter={d => fmtDateShort(d)} />
              <YAxis tick={{ fontSize: 11, fill: TEXT_COLOR }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(220 12% 14%)', border: '1px solid hsl(220 12% 20%)', borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="planned"  stroke="hsl(220 8% 58%)" strokeWidth={2} dot={false} name="Planejado" />
              <Line type="monotone" dataKey="produced" stroke={GREEN}            strokeWidth={2} dot={false} name="Produzido" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Timeline */}
      {timeline && timeline.length > 0 && (
        <ChartCard title="Timeline de Ocupação — últimos 3 dias">
          <GanttChart data={timeline} />
        </ChartCard>
      )}
    </div>
  );
}
