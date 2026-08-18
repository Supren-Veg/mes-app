import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api }     from '../api/client';
import { Button }  from '@/components/ui/button';
import { LogOut, ChefHat, Plus, Pencil, Trash2, Check, X, ChevronLeft, ChevronRight, RefreshCw, Clock, Loader2 } from 'lucide-react';

// ─── Helpers de data/hora ────────────────────────────────────────────────────

function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// "YYYY-MM-DDTHH:MM:00" → "HH:MM"
function toTime(iso) {
  if (!iso) return '';
  return iso.slice(11, 16);
}

// "HH:MM" + "YYYY-MM-DD" → "YYYY-MM-DDTHH:MM:00"
function toISO(date, time) {
  if (!time) return null;
  return `${date}T${time}:00`;
}

function durationLabel(started_at, finished_at) {
  if (!started_at || !finished_at) return null;
  const min = Math.round((new Date(finished_at) - new Date(started_at)) / 60000);
  if (min <= 0) return null;
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

const EMPTY_NEW = { order_id: '', stage_id: '', started_at: '', finished_at: '', date: '' };

// ─── Linha em modo leitura ────────────────────────────────────────────────────

function ReadRow({ step, onEdit, onDelete, deleting }) {
  const dur = durationLabel(step.started_at, step.finished_at);
  const needsFinish = step.started_at && !step.finished_at;
  return (
    <tr className={`border-b border-border transition-colors ${needsFinish ? 'bg-warn/5 hover:bg-warn/10' : 'hover:bg-muted/30'}`}>
      <td className="px-3 py-3 text-sm text-foreground font-medium">{step.product_name}</td>
      <td className="px-3 py-3 text-sm text-foreground">{step.stage_name}</td>
      <td className="px-3 py-3 text-sm text-foreground font-mono">{toTime(step.started_at) || '—'}</td>
      <td className="px-3 py-3 text-sm">
        {needsFinish ? (
          <span className="text-xs text-warn font-medium">Aguardando término</span>
        ) : (
          <>
            <span className="font-mono text-foreground">{toTime(step.finished_at) || '—'}</span>
            {dur && <span className="ml-2 text-xs text-muted-foreground">({dur})</span>}
          </>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(step)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Editar"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={() => onDelete(step.id)}
            disabled={deleting === step.id}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
            title="Excluir"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Linha em modo edição ─────────────────────────────────────────────────────

function EditRow({ data, orders, stages, onChange, onSave, onCancel, saving, error, autoSaving }) {
  const requiredFilled = data.order_id && data.stage_id && data.date && data.started_at;
  return (
    <>
      <tr className="border-b border-primary/30 bg-primary/5">
        {/* Produto + Data */}
        <td className="px-2 py-2">
          <select
            value={data.order_id}
            onChange={e => onChange({ ...data, order_id: e.target.value })}
            className="w-full border border-border rounded-lg px-2 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Produto…</option>
            {orders.map(o => {
              const date = o.production_date ? fmtDate(o.production_date) : null;
              const qty  = o.planned_qty     ? `${o.planned_qty}${o.unit || 'kg'}` : null;
              const label = [o.product_name, date, qty].filter(Boolean).join(' — ');
              return <option key={o.id} value={o.id}>{label}</option>;
            })}
          </select>
          <input
            type="date"
            value={data.date}
            onChange={e => onChange({ ...data, date: e.target.value })}
            className="mt-1 w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </td>

        {/* Etapa */}
        <td className="px-2 py-2">
          <select
            value={data.stage_id}
            onChange={e => onChange({ ...data, stage_id: e.target.value })}
            className="w-full border border-border rounded-lg px-2 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Etapa…</option>
            {stages.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </td>

        {/* Início */}
        <td className="px-2 py-2">
          <input
            type="time"
            value={data.started_at}
            onChange={e => onChange({ ...data, started_at: e.target.value })}
            className="w-full border border-border rounded-lg px-2 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </td>

        {/* Término */}
        <td className="px-2 py-2">
          <input
            type="time"
            value={data.finished_at}
            onChange={e => onChange({ ...data, finished_at: e.target.value })}
            className="w-full border border-border rounded-lg px-2 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            placeholder="opcional"
          />
        </td>

        {/* Ações */}
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onSave}
              disabled={saving}
              className="p-1.5 rounded-lg text-success hover:bg-success/10 transition-colors disabled:opacity-40"
              title={autoSaving && requiredFilled ? 'Salvando automaticamente…' : 'Salvar'}
            >
              {autoSaving && requiredFilled
                ? <Loader2 className="size-5 animate-spin" />
                : <Check className="size-5" />}
            </button>
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
              title="Cancelar"
            >
              <X className="size-5" />
            </button>
          </div>
        </td>
      </tr>
      {(error || (autoSaving && requiredFilled)) && (
        <tr>
          <td colSpan={5} className="px-3 py-2">
            {autoSaving && requiredFilled && (
              <p className="text-xs text-warn bg-warn/10 rounded-lg px-3 py-2">
                Salvando automaticamente…
              </p>
            )}
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Tablet() {
  const { user, logout } = useAuth();

  const [selectedDate, setSelectedDate] = useState(toLocalISO(new Date()));
  const [steps,        setSteps]        = useState([]);
  const [orders,       setOrders]       = useState([]);
  const [stages,       setStages]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [fetchError,   setFetchError]   = useState(null);

  // Estado do formulário de nova linha
  const [newRow,      setNewRow]      = useState(null);   // null = oculto
  const [newSaving,   setNewSaving]   = useState(false);
  const [newError,    setNewError]    = useState(null);
  const [autoSaving,  setAutoSaving]  = useState(false);

  // Estado da linha em edição
  const [editingId,   setEditingId]   = useState(null);
  const [editData,    setEditData]    = useState({});
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);

  const refreshRef   = useRef(null);
  const syncPollRef  = useRef(null);
  const autoSaveRef  = useRef(null);

  // ── Buscar dados ────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [stepsData, ordersData] = await Promise.all([
        api.get(`/orders/steps?date=${selectedDate}`),
        // Busca todas as ordens Pendente/Em Andamento (qualquer data) para o dropdown
        api.get(`/orders?status=Pendente,Em+Andamento`),
      ]);
      setSteps(stepsData);
      setOrders(ordersData);
    } catch (e) {
      setFetchError('Erro ao carregar dados. Verifique a conexão.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Busca stages apenas uma vez
  useEffect(() => {
    api.get('/stages?legacy=false').then(setStages).catch(() => {});
  }, []);

  // Rebusca ao trocar de data
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh a cada 30s (múltiplos usuários no mesmo tablet)
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      fetchAll();
    }, 30000);
    return () => clearInterval(refreshRef.current);
  }, [fetchAll]);

  // Autosave: cria a etapa automaticamente quando os campos obrigatórios estão preenchidos.
  // Permite que um operador registre o início e outro operador adicione o término depois.
  useEffect(() => {
    if (!newRow) { clearTimeout(autoSaveRef.current); return; }

    const { order_id, stage_id, date, started_at } = newRow;
    if (!order_id || !stage_id || !date || !started_at) return;

    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      setAutoSaving(true);
      setNewError(null);
      try {
        await api.post(`/orders/${order_id}/steps`, {
          stage_id:    Number(stage_id),
          started_at:  toISO(date, started_at),
          finished_at: toISO(date, newRow.finished_at) ?? null,
        });
        setNewRow(null);
        fetchAll();
      } catch (e) {
        setNewError(e.message || 'Erro ao salvar automaticamente.');
      } finally {
        setAutoSaving(false);
      }
    }, 1200);

    return () => clearTimeout(autoSaveRef.current);
  }, [newRow, fetchAll]);

  // ── Navegação de datas ──────────────────────────────────────────────────────

  function shiftDay(delta) {
    setSelectedDate(prev => {
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() + delta);
      return toLocalISO(d);
    });
    setNewRow(null);
    setEditingId(null);
  }

  const today = toLocalISO(new Date());
  const isToday = selectedDate === today;

  // ── Nova linha ──────────────────────────────────────────────────────────────

  function openNewRow() {
    setEditingId(null);
    setNewRow({ ...EMPTY_NEW, date: selectedDate });
    setNewError(null);
  }

  async function saveNewRow() {
    if (!newRow.order_id) return setNewError('Selecione o produto.');
    if (!newRow.stage_id) return setNewError('Selecione a etapa.');
    if (!newRow.date) return setNewError('Informe a data.');
    if (!newRow.started_at) return setNewError('Informe o horário de início.');

    setNewSaving(true);
    setNewError(null);
    try {
      await api.post(`/orders/${newRow.order_id}/steps`, {
        stage_id:    Number(newRow.stage_id),
        started_at:  toISO(newRow.date, newRow.started_at),
        finished_at: toISO(newRow.date, newRow.finished_at) ?? null,
      });
      setNewRow(null);
      fetchAll();
    } catch (e) {
      setNewError(e.message);
    } finally {
      setNewSaving(false);
    }
  }

  // ── Editar linha ────────────────────────────────────────────────────────────

  function startEdit(step) {
    setNewRow(null);
    setEditingId(step.id);
    setEditData({
      order_id:    String(step.order_id),
      stage_id:    String(step.stage_id),
      started_at:  toTime(step.started_at),
      finished_at: toTime(step.finished_at),
      date:        step.started_at?.slice(0, 10) || selectedDate,
    });
    setEditError(null);
  }

  async function saveEdit() {
    if (!editData.stage_id) return setEditError('Selecione a etapa.');
    if (!editData.date) return setEditError('Informe a data.');
    if (!editData.started_at) return setEditError('Informe o horário de início.');

    setEditSaving(true);
    setEditError(null);
    try {
      await api.put(`/orders/steps/${editingId}`, {
        stage_id:    Number(editData.stage_id),
        started_at:  toISO(editData.date, editData.started_at),
        finished_at: toISO(editData.date, editData.finished_at) ?? null,
      });
      setEditingId(null);
      fetchAll();
    } catch (e) {
      setEditError(e.message);
    } finally {
      setEditSaving(false);
    }
  }

  // ── Excluir linha ───────────────────────────────────────────────────────────

  async function deleteStep(id) {
    if (!window.confirm('Excluir esta etapa?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/orders/steps/${id}`);
      setSteps(prev => prev.filter(s => s.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  // ── Sync ────────────────────────────────────────────────────────────────────

  // Limpa o poll do sync ao desmontar
  useEffect(() => () => clearInterval(syncPollRef.current), []);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await api.post('/sync', {});
      syncPollRef.current = setInterval(async () => {
        try {
          const d = await api.get('/sync');
          if (!d.running) {
            clearInterval(syncPollRef.current);
            setSyncing(false);
            fetchAll();
          }
        } catch {
          clearInterval(syncPollRef.current);
          setSyncing(false);
        }
      }, 2000);
    } catch {
      setSyncing(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary shrink-0">
            <ChefHat className="size-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-base leading-none">Produção</p>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-muted-foreground p-2 disabled:opacity-40"
            title="Sincronizar Fácil123"
          >
            <RefreshCw className={`size-5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={logout} className="text-muted-foreground p-2">
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col p-4 gap-4">

        {/* Seletor de data */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => shiftDay(-1)}
            className="p-2 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>

          <div className="flex flex-col items-center gap-1 flex-1">
            <span className="text-base font-semibold text-foreground">{fmtDate(selectedDate)}</span>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(today)}
                className="text-xs text-primary underline"
              >
                Ir para hoje
              </button>
            )}
          </div>

          <button
            onClick={() => shiftDay(1)}
            className="p-2 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Erro de carregamento */}
        {fetchError && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3 text-center">
            {fetchError}
          </p>
        )}

        {/* Tabela */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Carregando…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produto</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Etapa</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <div className="flex items-center gap-1"><Clock className="size-3.5" />Início</div>
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Término</th>
                    <th className="px-3 py-2.5 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {steps.length === 0 && !newRow && (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        Nenhuma etapa registrada para este dia.
                      </td>
                    </tr>
                  )}

                  {steps.map(step =>
                    editingId === step.id ? (
                      <EditRow
                        key={step.id}
                        data={editData}
                        orders={orders}
                        stages={stages}
                        onChange={setEditData}
                        onSave={saveEdit}
                        onCancel={() => setEditingId(null)}
                        saving={editSaving}
                        error={editError}
                      />
                    ) : (
                      <ReadRow
                        key={step.id}
                        step={step}
                        onEdit={startEdit}
                        onDelete={deleteStep}
                        deleting={deletingId}
                      />
                    )
                  )}

                  {/* Nova linha */}
                  {newRow && (
                    <EditRow
                      data={newRow}
                      orders={orders}
                      stages={stages}
                      onChange={setNewRow}
                      onSave={saveNewRow}
                      onCancel={() => { clearTimeout(autoSaveRef.current); setNewRow(null); }}
                      saving={newSaving || autoSaving}
                      error={newError}
                      autoSaving={autoSaving}
                    />
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Botão adicionar linha */}
        {!loading && (
          orders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center">
              Nenhuma ordem de produção para este dia. Crie uma no painel de gestão.
            </p>
          ) : (
            <Button
              onClick={openNewRow}
              disabled={!!newRow}
              variant="outline"
              size="lg"
              className="w-full rounded-xl text-base py-6 border-dashed"
            >
              <Plus className="size-5 mr-2" />
              Nova linha
            </Button>
          )
        )}
      </div>
    </div>
  );
}
