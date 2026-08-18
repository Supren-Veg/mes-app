import { useMemo } from 'react';
import { STAGE_COLORS } from '../utils/colors';

export default function GanttChart({ data }) {
  const last3 = useMemo(() => {
    const dates = [...new Set(data.map(d => d.production_date))].sort().slice(-3);
    return data.filter(d => dates.includes(d.production_date));
  }, [data]);

  const days = useMemo(() =>
    [...new Set(last3.map(d => d.production_date))].sort(), [last3]);

  // Constrói o mapa de cores uma única vez — mesmo mapa usado no gráfico e na legenda
  const stageColors = useMemo(() => {
    const colors = {};
    let ci = 0;
    for (const r of last3) {
      if (!colors[r.stage]) colors[r.stage] = STAGE_COLORS[ci++ % STAGE_COLORS.length];
    }
    return colors;
  }, [last3]);

  if (!last3.length) return <p className="text-sm text-muted-foreground">Sem dados de timeline.</p>;

  return (
    <div className="space-y-6 overflow-x-auto">
      {days.map(day => {
        const dayRows = last3.filter(d => d.production_date === day);
        const starts  = dayRows.map(d => new Date(d.started_at).getTime()).filter(Boolean);
        const ends    = dayRows.map(d => new Date(d.finished_at).getTime()).filter(Boolean);
        const minTs   = Math.min(...starts);
        const maxTs   = Math.max(...ends);
        const range   = maxTs - minTs || 1;
        const toPercent = ts => ((ts - minTs) / range) * 100;

        const byOp = {};
        for (const r of dayRows) {
          const op = r.operator || 'Sem usuário';
          if (!byOp[op]) byOp[op] = [];
          byOp[op].push(r);
        }

        return (
          <div key={day}>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{day}</p>
            {Object.entries(byOp).map(([op, rows]) => (
              <div key={op} className="mb-3">
                <p className="text-xs text-muted-foreground mb-1">{op}</p>
                <div className="relative h-8 bg-muted rounded overflow-hidden">
                  {rows.map(r => {
                    if (!r.started_at || !r.finished_at) return null;
                    const s = new Date(r.started_at).getTime();
                    const e = new Date(r.finished_at).getTime();
                    const left  = toPercent(s);
                    const width = toPercent(e) - left;
                    return (
                      <div
                        key={r.step_id}
                        title={`${r.stage}\n${r.product}\n${r.net_time_minutes} min líq.`}
                        style={{
                          left:  `${left}%`,
                          width: `${Math.max(width, 0.3)}%`,
                          backgroundColor: stageColors[r.stage],
                        }}
                        className="absolute top-1 bottom-1 rounded text-white text-[9px]
                                   flex items-center justify-center overflow-hidden px-0.5
                                   cursor-default opacity-90 hover:opacity-100 transition-opacity"
                      >
                        {width > 6 ? r.stage : ''}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>{new Date(minTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{new Date(maxTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Legenda — usa o mesmo mapa de cores do gráfico */}
      <div className="flex flex-wrap gap-2 mt-2">
        {Object.entries(stageColors).slice(0, 12).map(([stage, color]) => (
          <span key={stage} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
            {stage}
          </span>
        ))}
      </div>
    </div>
  );
}
