import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useApi } from '../hooks/useApi';
import { STAGE_COLORS } from '../utils/colors';

const today   = new Date().toISOString().slice(0, 10);
const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);

const GRID  = 'hsl(220 12% 22%)';
const TEXT  = 'hsl(220 8% 58%)';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs space-y-1 max-w-[220px]">
      <p className="font-semibold text-foreground">{d.stage}</p>
      <p className="text-muted-foreground">Média: <span className="font-medium text-foreground">{d.avg_net_minutes} min</span></p>
      <p className="text-muted-foreground">Mín: {d.min_net_minutes} min · Máx: {d.max_net_minutes} min</p>
      <p className="text-muted-foreground">Pausas médias: {d.avg_pause_minutes} min</p>
      <p className="text-muted-foreground">{d.occurrences} ocorrência{d.occurrences !== 1 ? 's' : ''}</p>
      {d.is_legacy ? <p className="text-warn">★ Etapa histórica genérica</p> : null}
    </div>
  );
}

export default function ProductAnalysis() {
  const [from,       setFrom]       = useState(yearAgo);
  const [to,         setTo]         = useState(today);
  const [productId,  setProductId]  = useState('');
  const [showLegacy, setShowLegacy] = useState(false);

  const { data: products } = useApi('/products');
  const qs = `?date_from=${from}&date_to=${to}${productId ? `&product_id=${productId}` : ''}`;
  const { data: raw, loading } = useApi(`/dashboard/by-product-stage${qs}`, [from, to, productId]);

  const selected = useMemo(() => {
    if (!raw) return null;
    if (productId) return raw.find(r => r.product_id === Number(productId)) || null;
    return null;
  }, [raw, productId]);

  const chartData = useMemo(() => {
    if (!selected) return [];
    return selected.stages
      .filter(s => showLegacy || !s.is_legacy)
      .map(s => ({ ...s }));
  }, [selected, showLegacy]);

  const allData = useMemo(() => {
    if (!raw || productId) return null;
    return raw;
  }, [raw, productId]);

  const totalAvg = chartData.filter(d => !d.is_legacy).reduce((a, b) => a + b.avg_net_minutes, 0);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-foreground">Tempo Médio por Etapa</h1>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="bg-background border border-border rounded px-2 py-1.5 text-sm text-foreground" />
        <span className="text-muted-foreground">→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="bg-background border border-border rounded px-2 py-1.5 text-sm text-foreground" />

        <select value={productId} onChange={e => setProductId(e.target.value)}
          className="bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground flex-1 min-w-[200px]">
          <option value="">Todos os produtos</option>
          {(products || []).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showLegacy} onChange={e => setShowLegacy(e.target.checked)}
            className="rounded" />
          Incluir etapas históricas (★)
        </label>
      </div>

      {loading && <p className="text-sm text-muted-foreground text-center py-8">Carregando…</p>}

      {/* Gráfico de 1 produto */}
      {selected && !loading && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">{selected.product}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {chartData.filter(d => !d.is_legacy).length} etapas ·{' '}
                Tempo líquido total médio:{' '}
                <span className="font-medium text-foreground">{totalAvg.toFixed(0)} min</span>
                {' '}({(totalAvg / 60).toFixed(1)}h)
              </p>
            </div>

            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 36)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID} />
                <XAxis type="number" tick={{ fontSize: 11, fill: TEXT }}
                  label={{ value: 'minutos', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: TEXT }} />
                <YAxis type="category" dataKey="stage" width={150} tick={{ fontSize: 11, fill: TEXT }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avg_net_minutes" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {chartData.map((entry, i) => (
                    <Cell key={entry.stage_id}
                      fill={entry.is_legacy ? 'hsl(var(--warn))' : STAGE_COLORS[i % STAGE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela detalhada */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  {['Etapa','Ocorrências','Mín (min)','Média (min)','Máx (min)','Pausas médias','Variação'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {chartData.map(row => {
                  const variation    = row.max_net_minutes - row.min_net_minutes;
                  const variationPct = row.avg_net_minutes > 0
                    ? Math.round((variation / row.avg_net_minutes) * 100) : 0;
                  return (
                    <tr key={row.stage_id} className="hover:bg-muted/50">
                      <td className="px-4 py-2 font-medium text-foreground">
                        {row.is_legacy && <span className="text-warn mr-1">★</span>}
                        {row.stage}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{row.occurrences}x</td>
                      <td className="px-4 py-2 text-muted-foreground">{row.min_net_minutes}</td>
                      <td className="px-4 py-2 font-semibold text-foreground">{row.avg_net_minutes}</td>
                      <td className="px-4 py-2 text-muted-foreground">{row.max_net_minutes}</td>
                      <td className="px-4 py-2 text-muted-foreground">{row.avg_pause_minutes}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          variationPct > 50 ? 'bg-destructive/20 text-destructive' :
                          variationPct > 25 ? 'bg-warn/20 text-warn' :
                                              'bg-success/20 text-success'
                        }`}>±{variationPct}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabela comparativa: todos os produtos */}
      {allData && !productId && !loading && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              Todos os Produtos — Etapas com Maior Tempo Médio
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Selecione um produto acima para ver o gráfico detalhado.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  {['Produto','Etapa principal','Tempo médio','Etapas','Tempo total médio'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allData.map(prod => {
                  const nonLegacy = prod.stages.filter(s => !s.is_legacy);
                  const top   = nonLegacy[0];
                  const total = nonLegacy.reduce((a, s) => a + s.avg_net_minutes, 0);
                  if (!top) return null;
                  return (
                    <tr key={prod.product_id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => setProductId(String(prod.product_id))}>
                      <td className="px-4 py-2 font-medium text-foreground max-w-[200px]">{prod.product}</td>
                      <td className="px-4 py-2 text-muted-foreground">{top.stage}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-primary"
                            style={{ width: `${Math.min(top.avg_net_minutes / 6, 120)}px` }} />
                          <span className="text-xs font-medium text-foreground">{top.avg_net_minutes} min</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{nonLegacy.length}</td>
                      <td className="px-4 py-2 text-foreground font-medium">
                        {total.toFixed(0)} min
                        <span className="text-muted-foreground text-xs ml-1">({(total/60).toFixed(1)}h)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
