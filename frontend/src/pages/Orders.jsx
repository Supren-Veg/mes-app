import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { api }     from '../api/client';
import { fmtDate } from '../utils/format';
import EditModal     from '../components/orders/EditModal';
import DeleteConfirm from '../components/orders/DeleteConfirm';
import { Card, CardContent } from '@/components/ui/card';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Download, Plus, RefreshCw } from 'lucide-react';

const today    = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

const statusVariant = {
  'Concluído':    'success',
  'Em Andamento': 'default',
  'Pendente':     'warning',
  'Cancelado':    'destructive',
};

const COLUMNS = [
  { label: 'Data',       key: 'production_date'   },
  { label: 'Produto',    key: 'product_name'      },
  { label: 'Usuário',    key: 'operator_name'     },
  { label: 'Planejado',  key: 'planned_qty'       },
  { label: 'Produzido',  key: 'produced_qty'      },
  { label: 'Eficiência', key: 'efficiency_pct'    },
  { label: 'Tempo Líq.', key: 'total_net_minutes' },
  { label: 'Status',     key: 'status'            },
  { label: '',           key: null                },
];

function applySort(arr, key, dir) {
  if (!key) return arr;
  return [...arr].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function exportCSV(rows) {
  const headers = ['Data','Produto','Usuário','Planejado','Unidade','Produzido','Eficiência (%)','Tempo Líq. (min)','Status'];
  const lines = rows.map(o => [
    o.production_date, o.product_name, o.operator_name || '',
    o.planned_qty ?? '', o.unit || '', o.produced_qty ?? '',
    o.efficiency_pct ?? '',
    o.total_net_minutes ? Math.round(o.total_net_minutes) : '',
    o.status,
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv  = [headers.join(','), ...lines].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'ordens.csv'; a.click();
  URL.revokeObjectURL(url);
}

function fmtDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'Z');
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Orders() {
  const { isGuest, user } = useAuth();
  const isAdmin      = user?.role === 'admin';
  const canConcluir  = user?.role === 'admin' || user?.role === 'conferente';

  const [from,     setFrom]     = useState(monthAgo);
  const [to,       setTo]       = useState(today);
  const [search,   setSearch]   = useState('');
  const [sort,     setSort]     = useState({ key: null, dir: 'asc' });
  const [editing,  setEditing]  = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [approving, setApproving] = useState(null);

  // Sync Fácil123
  const [syncing,   setSyncing]   = useState(false);
  const [syncInfo,  setSyncInfo]  = useState(null);
  const [syncToast, setSyncToast] = useState(null); // { imported, errors }
  const pollRef  = useRef(null);
  const toastRef = useRef(null);

  const qs = `?date_from=${from}&date_to=${to}`;
  const { data: orders, loading, refetch } = useApi(`/orders${qs}`, [from, to]);

  // Carrega status do último sync ao montar
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/sync').then(d => setSyncInfo(d)).catch(() => {});
  }, [isAdmin]);

  function showToast(lastSync) {
    setSyncToast(lastSync);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setSyncToast(null), 6000);
  }

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await api.post('/sync', {});
    } catch (e) {
      setSyncing(false);
      setSyncToast({ error: e.message || 'Erro ao iniciar sincronização.' });
      clearTimeout(toastRef.current);
      toastRef.current = setTimeout(() => setSyncToast(null), 6000);
      return;
    }
    // Polling até sync terminar
    pollRef.current = setInterval(async () => {
      try {
        const d = await api.get('/sync');
        setSyncInfo(d);
        if (!d.running) {
          clearInterval(pollRef.current);
          setSyncing(false);
          refetch();
          if (d.lastSync) showToast(d.lastSync);
        }
      } catch (_) {
        clearInterval(pollRef.current);
        setSyncing(false);
      }
    }, 4000);
  }

  useEffect(() => () => { clearInterval(pollRef.current); clearTimeout(toastRef.current); }, []);

  async function handleApprove(order) {
    setApproving(order.id);
    try {
      await api.put(`/orders/${order.id}`, { status: 'Concluído' });
      refetch();
    } finally {
      setApproving(null);
    }
  }

  const filtered = (orders || []).filter(o =>
    !search || o.product_name.toLowerCase().includes(search.toLowerCase())
  );
  const rows = applySort(filtered, sort.key, sort.dir);

  function handleSort(key) {
    if (!key) return;
    setSort(s => s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }
    );
  }

  return (
    <div className="space-y-4">
      {editing  && <EditModal    order={editing}  onClose={() => setEditing(null)}  onSaved={refetch} />}
      {deleting && <DeleteConfirm order={deleting} onClose={() => setDeleting(null)} onDeleted={refetch} />}

      {/* Toast de sync */}
      {syncToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-card border border-border rounded-xl shadow-xl px-4 py-3 flex items-start gap-3 max-w-sm animate-in slide-in-from-bottom-2">
          <div className={`mt-0.5 size-2 rounded-full shrink-0 ${syncToast.error || syncToast.errors > 0 ? 'bg-destructive' : 'bg-primary'}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {syncToast.error ? 'Erro no sync Fácil123' : 'Sync Fácil123 concluído'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 break-words">
              {syncToast.error
                ? syncToast.error
                : (
                  <>
                    {syncToast.imported > 0 ? `${syncToast.imported} nova(s) ordem(s) importada(s)` : 'Nenhuma ordem nova'}
                    {syncToast.updated  > 0 ? ` · ${syncToast.updated} atualizada(s)` : ''}
                    {syncToast.errors   > 0 ? ` · ${syncToast.errors} erro(s)` : ''}
                    {syncToast.message  ? <><br /><span className="text-destructive">{syncToast.message}</span></> : null}
                  </>
                )
              }
            </p>
          </div>
          <button onClick={() => setSyncToast(null)} className="text-muted-foreground hover:text-foreground ml-1 text-base leading-none shrink-0">×</button>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" />
            <span className="text-muted-foreground">→</span>
            <Input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="w-36" />
            <Input
              placeholder="Buscar produto…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[160px]"
            />
            <Button variant="outline" size="sm" onClick={() => exportCSV(rows)} disabled={rows.length === 0}>
              <Download className="size-4" /> Exportar CSV
            </Button>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Sincronizando…' : 'Atualizar Fácil123'}
                </Button>
                {syncInfo?.lastSync && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {syncInfo.lastSync.status === 'ok' || syncInfo.lastSync.status === 'partial'
                      ? `Sync: ${fmtDateTime(syncInfo.lastSync.finished_at)}`
                      : `Sync: ${syncInfo.lastSync.status}`
                    }
                  </span>
                )}
              </div>
            )}
            {!isGuest && (
              <Button size="sm" asChild>
                <Link to="/orders/new"><Plus className="size-4" /> Nova Ordem</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Carregando…</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {COLUMNS.map(col => (
                    <th
                      key={col.key ?? '__actions'}
                      onClick={() => handleSort(col.key)}
                      className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide
                        ${col.key ? 'cursor-pointer select-none hover:text-foreground' : ''}`}
                    >
                      {col.label}
                      {col.key && (
                        <span className="ml-1">
                          {sort.key === col.key
                            ? sort.dir === 'asc' ? '↑' : '↓'
                            : <span className="opacity-20">↕</span>
                          }
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(o => (
                  <tr key={o.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(o.production_date)}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{o.product_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{o.operator_name || '—'}</td>
                    <td className="px-4 py-2.5">{o.planned_qty  != null ? `${o.planned_qty} ${o.unit}`  : '—'}</td>
                    <td className="px-4 py-2.5">{o.produced_qty != null ? `${o.produced_qty} ${o.unit}` : '—'}</td>
                    <td className="px-4 py-2.5">
                      {o.efficiency_pct != null ? (
                        <span className={`font-semibold ${
                          o.efficiency_pct >= 100 ? 'text-primary' :
                          o.efficiency_pct >= 80  ? 'text-warn' : 'text-destructive'
                        }`}>{o.efficiency_pct}%</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {o.total_net_minutes ? `${Math.round(o.total_net_minutes)} min` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={statusVariant[o.status] ?? 'outline'}>{o.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link to={`/orders/${o.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline mr-3">
                        Ver
                      </Link>
                      {!isGuest && (
                        <>
                          {canConcluir && o.status === 'Em Andamento' && (
                            <button
                              onClick={() => handleApprove(o)}
                              disabled={approving === o.id}
                              className="text-xs text-primary hover:text-primary/80 hover:underline mr-3 font-semibold disabled:opacity-50">
                              {approving === o.id ? 'Concluindo…' : 'Concluir'}
                            </button>
                          )}
                          <button onClick={() => setEditing(o)}
                            className="text-xs text-muted-foreground hover:text-foreground hover:underline mr-3">
                            Editar
                          </button>
                          <button onClick={() => setDeleting(o)}
                            className="text-xs text-destructive hover:text-destructive/80 hover:underline">
                            Excluir
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
