import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { STAGE_COLORS } from '../utils/colors';

const today    = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);



function fmtMin(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function OperatorAnalysis() {
  const [from, setFrom] = useState(monthAgo);
  const [to,   setTo]   = useState(today);

  const qs = `?date_from=${from}&date_to=${to}`;
  const { data: byOp }    = useApi(`/dashboard/by-operator${qs}`, [from, to]);
  const { data: topProds } = useApi(`/dashboard/top-products-by-operator${qs}`, [from, to]);

  const operators = byOp || [];

  // Monta top-3 produtos por operador
  const topByOp = {};
  for (const row of (topProds || [])) {
    if (!topByOp[row.operator]) topByOp[row.operator] = [];
    if (topByOp[row.operator].length < 3) topByOp[row.operator].push(row);
  }

  // Dados para o gráfico de barras (tempo total por operador)
  const chartData = operators
    .filter(op => op.total_net_minutes)
    .map(op => ({ name: op.operator.split(' ')[0], minutos: Math.round(op.total_net_minutes) }));

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" />
            <span className="text-muted-foreground">→</span>
            <Input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="w-36" />
          </div>
        </CardContent>
      </Card>

      {/* Gráfico — tempo por operador */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tempo líquido por operador (min)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
                  formatter={v => [`${v} min`, 'Tempo']}
                />
                <Bar dataKey="minutos" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Cards por operador */}
      {operators.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nenhum dado no período.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {operators.map((op, i) => (
            <Card key={op.operator_id ?? op.operator}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-9 items-center justify-center rounded-full text-sm font-bold text-primary-foreground shrink-0"
                    style={{ background: STAGE_COLORS[i % STAGE_COLORS.length] }}
                  >
                    {op.operator[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{op.operator}</p>
                    <p className="text-xs text-muted-foreground">{op.total_orders} ordens</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Métricas */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Etapas</p>
                    <p className="text-sm font-semibold text-foreground">{op.total_steps ?? '—'}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Tempo total</p>
                    <p className="text-sm font-semibold text-foreground">{fmtMin(op.total_net_minutes)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Eficiência</p>
                    <p className={`text-sm font-semibold ${
                      op.avg_efficiency_pct >= 100 ? 'text-primary' :
                      op.avg_efficiency_pct >= 80  ? 'text-warn' :
                      op.avg_efficiency_pct        ? 'text-destructive' : 'text-muted-foreground'
                    }`}>
                      {op.avg_efficiency_pct != null ? `${op.avg_efficiency_pct}%` : '—'}
                    </p>
                  </div>
                </div>

                {/* Top produtos */}
                {(topByOp[op.operator] || []).length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Produtos mais produzidos</p>
                    <div className="flex flex-col gap-1">
                      {(topByOp[op.operator] || []).map(p => (
                        <div key={p.product} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-foreground truncate">{p.product}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {p.orders}x
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
