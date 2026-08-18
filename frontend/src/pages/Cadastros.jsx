import { useState, useMemo } from 'react';
import { useApi }  from '../hooks/useApi';
import { api }     from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Badge }  from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, X } from 'lucide-react';

/* ─── helpers de tabela ──────────────────────────────────────── */
function Th({ children, className = '' }) {
  return (
    <th className={`px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '' }) {
  return <td className={`px-3 py-2.5 text-sm ${className}`}>{children}</td>;
}
function EmptyRow({ cols, msg = 'Nenhum item encontrado.' }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-sm text-muted-foreground">{msg}</td>
    </tr>
  );
}

/* ─── aba Produtos ───────────────────────────────────────────── */
function TabProdutos({ products, refetch, onError }) {
  const [search,  setSearch]  = useState('');
  const [editId,  setEditId]  = useState(null);
  const [editVal, setEditVal] = useState({});
  const [form,    setForm]    = useState({ name: '', unit: 'KG' });

  const filtered = useMemo(() =>
    (products || []).filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search]
  );

  async function add() {
    if (!form.name.trim()) return;
    try { await api.post('/products', form); setForm({ name: '', unit: 'KG' }); refetch(); }
    catch (e) { onError(e.message); }
  }

  async function save(id) {
    try { await api.put(`/products/${id}`, editVal); setEditId(null); refetch(); }
    catch (e) { onError(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Nome do produto" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && add()} className="flex-1" />
        <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-20">
          {['KG','UND','L','G'].map(u => <option key={u}>{u}</option>)}
        </select>
        <Button onClick={add} size="sm"><Plus className="size-4" /> Adicionar</Button>
      </div>

      <div className="flex items-center justify-between">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto…" className="w-56" />
        <span className="text-xs text-muted-foreground">{filtered.length} de {products?.length ?? 0}</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/40 border-b border-border">
            <tr><Th>Nome</Th><Th className="w-24 text-center">Unidade</Th><Th className="w-24 text-center">Ação</Th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? <EmptyRow cols={3} /> : filtered.map(p => (
              <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                {editId === p.id ? (
                  <>
                    <Td><Input value={editVal.name} onChange={e => setEditVal(v => ({ ...v, name: e.target.value }))} autoFocus /></Td>
                    <Td className="text-center">
                      <select value={editVal.unit} onChange={e => setEditVal(v => ({ ...v, unit: e.target.value }))}
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                        {['KG','UND','L','G'].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </Td>
                    <Td className="text-center">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" onClick={() => save(p.id)}>Salvar</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
                      </div>
                    </Td>
                  </>
                ) : (
                  <>
                    <Td className="font-medium text-foreground">{p.name}</Td>
                    <Td className="text-center"><Badge variant="outline">{p.unit}</Badge></Td>
                    <Td className="text-center">
                      <button onClick={() => { setEditId(p.id); setEditVal({ name: p.name, unit: p.unit }); }}
                        className="text-xs text-primary hover:text-primary/80 font-medium">Editar</button>
                    </Td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── aba Etapas ─────────────────────────────────────────────── */
function TabEtapas({ stages, refetch, onError }) {
  const [search,  setSearch]  = useState('');
  const [editId,  setEditId]  = useState(null);
  const [editVal, setEditVal] = useState({});
  const [form,    setForm]    = useState({ name: '', category: '' });

  const filtered = useMemo(() =>
    (stages || []).filter(s => s.name.toLowerCase().includes(search.toLowerCase())),
    [stages, search]
  );

  async function add() {
    if (!form.name.trim()) return;
    try { await api.post('/stages', form); setForm({ name: '', category: '' }); refetch(); }
    catch (e) { onError(e.message); }
  }

  async function save(id) {
    try { await api.put(`/stages/${id}`, editVal); setEditId(null); refetch(); }
    catch (e) { onError(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Nome da etapa" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && add()} className="flex-1" />
        <Input placeholder="Categoria (opcional)" value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-44" />
        <Button onClick={add} size="sm"><Plus className="size-4" /> Adicionar</Button>
      </div>

      <div className="flex items-center justify-between">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar etapa…" className="w-56" />
        <span className="text-xs text-muted-foreground">{filtered.length} de {stages?.length ?? 0}</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/40 border-b border-border">
            <tr><Th>Nome</Th><Th className="w-36">Categoria</Th><Th className="w-20 text-center">Tipo</Th><Th className="w-24 text-center">Ação</Th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? <EmptyRow cols={4} /> : filtered.map(s => (
              <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                {editId === s.id ? (
                  <>
                    <Td><Input value={editVal.name} onChange={e => setEditVal(v => ({ ...v, name: e.target.value }))} autoFocus /></Td>
                    <Td><Input value={editVal.category} onChange={e => setEditVal(v => ({ ...v, category: e.target.value }))} placeholder="Categoria" /></Td>
                    <Td className="text-center text-muted-foreground">—</Td>
                    <Td className="text-center">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" onClick={() => save(s.id)}>Salvar</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
                      </div>
                    </Td>
                  </>
                ) : (
                  <>
                    <Td className="font-medium text-foreground">{s.name}</Td>
                    <Td className="text-muted-foreground">{s.category || <span className="opacity-30">—</span>}</Td>
                    <Td className="text-center">
                      {s.is_legacy && <Badge variant="warning">Legado</Badge>}
                    </Td>
                    <Td className="text-center">
                      <button onClick={() => { setEditId(s.id); setEditVal({ name: s.name, category: s.category || '' }); }}
                        className="text-xs text-primary hover:text-primary/80 font-medium">Editar</button>
                    </Td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Legado = etapa histórica sem desmembramento de tempo por sub-etapa.</p>
    </div>
  );
}

/* ─── aba Metas ──────────────────────────────────────────────── */
function TabMetas({ targets, stages, refetchTargets, onError }) {
  const [form, setForm] = useState({ stage_id: '', target_minutes: '' });

  async function add() {
    if (!form.stage_id || !form.target_minutes) return;
    try {
      await api.post('/stage-targets', { stage_id: Number(form.stage_id), target_minutes: Number(form.target_minutes) });
      setForm({ stage_id: '', target_minutes: '' });
      refetchTargets();
    } catch (e) { onError(e.message); }
  }

  async function remove(id) {
    try { await api.delete(`/stage-targets/${id}`); refetchTargets(); }
    catch (e) { onError(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select value={form.stage_id} onChange={e => setForm(f => ({ ...f, stage_id: e.target.value }))}
          className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">Selecione a etapa…</option>
          {(stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Input type="number" step="0.5" min="0" placeholder="Meta (min)"
          value={form.target_minutes} onChange={e => setForm(f => ({ ...f, target_minutes: e.target.value }))} className="w-32" />
        <Button onClick={add} size="sm"><Plus className="size-4" /> Definir</Button>
      </div>
      <p className="text-xs text-muted-foreground">Tempo-alvo por ocorrência — usado no gráfico de comparação do Dashboard.</p>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/40 border-b border-border">
            <tr><Th>Etapa</Th><Th className="w-32 text-center">Meta (min)</Th><Th className="w-20 text-center">Ação</Th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!targets?.length ? <EmptyRow cols={3} msg="Nenhuma meta definida." /> : targets.map(t => (
              <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                <Td className="font-medium text-foreground">{t.stage_name}</Td>
                <Td className="text-center"><Badge variant="warning">{t.target_minutes} min</Badge></Td>
                <Td className="text-center">
                  <button onClick={() => remove(t.id)} className="text-xs text-destructive hover:text-destructive/80 font-medium">Remover</button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── aba Usuários ───────────────────────────────────────────── */
function TabUsuarios({ operators, refetch, onError, me }) {
  const [search,    setSearch]    = useState('');
  const [form,      setForm]      = useState({ name: '', email: '' });
  const [msg,       setMsg]       = useState(null);
  const [editId,    setEditId]    = useState(null);
  const [editVal,   setEditVal]   = useState({});
  const [resetMsg,  setResetMsg]  = useState(null);
  const [resetting, setResetting] = useState(null);

  const filtered = useMemo(() =>
    (operators || []).filter(o => o.name.toLowerCase().includes(search.toLowerCase())),
    [operators, search]
  );

  async function add() {
    if (!form.name.trim()) return;
    try {
      setMsg(null);
      const res = await api.post('/operators', form);
      if (res.emailSent) setMsg(`Senha enviada para ${form.email}`);
      setForm({ name: '', email: '' });
      refetch();
    } catch (e) { onError(e.message); }
  }

  async function saveEdit(id) {
    try { await api.put(`/operators/${id}`, editVal); setEditId(null); refetch(); }
    catch (e) { onError(e.message); }
  }

  async function resetPassword(op) {
    if (!window.confirm(`Redefinir senha de "${op.name}"?`)) return;
    setResetting(op.id); setResetMsg(null);
    try {
      const res = await api.post(`/operators/${op.id}/reset-password`, {});
      if (res.emailSent) setResetMsg({ opId: op.id, text: `Senha enviada para ${op.email}`, isPassword: false });
      else if (res.tempPassword) setResetMsg({ opId: op.id, text: `Senha temporária: ${res.tempPassword}`, isPassword: true });
      else setResetMsg({ opId: op.id, text: 'Senha redefinida. Configure o e-mail para envio automático.', isPassword: false });
    } catch (e) { onError(e.message); }
    finally { setResetting(null); }
  }

  const ROLE_CYCLE = { admin: 'conferente', conferente: 'producao', producao: 'admin' };
  const ROLE_LABEL = { admin: 'Admin', conferente: 'Conferente', producao: 'Produção' };
  const ROLE_CLASS = {
    admin:      'bg-primary/20 text-primary hover:bg-primary/30',
    conferente: 'bg-muted text-muted-foreground hover:bg-muted/80',
    producao:   'bg-warn/20 text-warn hover:bg-warn/30',
  };

  async function toggleRole(op) {
    if (op.id === me?.id) return;
    const next = ROLE_CYCLE[op.role] ?? 'conferente';
    try { await api.put(`/operators/${op.id}`, { role: next }); refetch(); }
    catch (e) { onError(e.message); }
  }

  async function toggleActive(op) {
    if (op.id === me?.id) return;
    try { await api.put(`/operators/${op.id}`, { active: op.active ? 0 : 1 }); refetch(); }
    catch (e) { onError(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Nome" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && add()} className="flex-1" />
        <Input placeholder="Email (opcional)" type="email" value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="flex-1" />
        <Button onClick={add} size="sm"><Plus className="size-4" /> Adicionar</Button>
      </div>

      {msg && <p className="text-xs text-primary font-medium">{msg}</p>}
      {resetMsg && (
        <div className={`flex items-center justify-between text-xs rounded-lg px-3 py-2
          ${resetMsg.isPassword ? 'bg-warn/10 border border-warn/30 text-warn' : 'bg-primary/10 border border-primary/30 text-primary'}`}>
          <span>{resetMsg.text}</span>
          <button onClick={() => setResetMsg(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="size-3" /></button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Se o email for informado, uma senha temporária será enviada automaticamente.
        Clique no badge de <strong>Perfil</strong> ou <strong>Status</strong> para alternar.
      </p>

      <div className="flex items-center justify-between">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuário…" className="w-56" />
        <span className="text-xs text-muted-foreground">{filtered.length} de {operators?.length ?? 0}</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/40 border-b border-border">
            <tr><Th>Nome</Th><Th>Email</Th><Th className="w-28 text-center">Perfil</Th><Th className="w-24 text-center">Status</Th><Th className="w-28 text-center">Ação</Th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? <EmptyRow cols={5} /> : filtered.map(op => {
              const isSelf = op.id === me?.id;
              return (
                <tr key={op.id} className="hover:bg-muted/30 transition-colors">
                  {editId === op.id ? (
                    <>
                      <Td><Input value={editVal.name} onChange={e => setEditVal(v => ({ ...v, name: e.target.value }))} autoFocus /></Td>
                      <Td><Input type="email" value={editVal.email} onChange={e => setEditVal(v => ({ ...v, email: e.target.value }))} placeholder="email@exemplo.com" /></Td>
                      <Td className="text-center text-muted-foreground">—</Td>
                      <Td className="text-center text-muted-foreground">—</Td>
                      <Td className="text-center">
                        <div className="flex gap-1 justify-center">
                          <Button size="sm" onClick={() => saveEdit(op.id)}>Salvar</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
                        </div>
                      </Td>
                    </>
                  ) : (
                    <>
                      <Td className="font-medium text-foreground">
                        {op.name}
                        {isSelf && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}
                      </Td>
                      <Td className="text-muted-foreground">{op.email || <span className="opacity-30">—</span>}</Td>
                      <Td className="text-center">
                        <button onClick={() => toggleRole(op)} disabled={isSelf}
                          title={isSelf ? 'Não é possível alterar seu próprio perfil' : `Clique para alternar perfil`}
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold transition-colors
                            ${ROLE_CLASS[op.role] ?? ROLE_CLASS.conferente}
                            ${isSelf ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                          {ROLE_LABEL[op.role] ?? 'Conferente'}
                        </button>
                      </Td>
                      <Td className="text-center">
                        <button onClick={() => toggleActive(op)} disabled={isSelf}
                          title={isSelf ? 'Não é possível alterar sua própria conta' : op.active ? 'Clique para desativar' : 'Clique para ativar'}
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold transition-colors
                            ${op.active ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'bg-destructive/20 text-destructive hover:bg-destructive/30'}
                            ${isSelf ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                          {op.active ? 'Ativo' : 'Inativo'}
                        </button>
                      </Td>
                      <Td className="text-center">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => { setEditId(op.id); setEditVal({ name: op.name, email: op.email || '' }); }}
                            className="text-xs text-primary hover:text-primary/80 font-medium">Editar</button>
                          {!isSelf && (
                            <button onClick={() => resetPassword(op)} disabled={resetting === op.id}
                              className="text-xs text-warn hover:text-warn font-medium disabled:opacity-40">
                              {resetting === op.id ? '…' : 'Senha ↺'}
                            </button>
                          )}
                        </div>
                      </Td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── página principal ───────────────────────────────────────── */
export default function Cadastros() {
  const { user: me } = useAuth();
  const { data: products,  refetch: refetchProducts  } = useApi('/products');
  const { data: stages,    refetch: refetchStages    } = useApi('/stages');
  const { data: operators, refetch: refetchOperators } = useApi('/operators');
  const { data: targets,   refetch: refetchTargets   } = useApi('/stage-targets');

  const [error, setError] = useState(null);

  const counts = {
    produtos:  products?.length  ?? 0,
    etapas:    stages?.length    ?? 0,
    metas:     targets?.length   ?? 0,
    usuarios:  operators?.length ?? 0,
  };

  return (
    <div className="space-y-4 max-w-4xl w-full">
      <h1 className="text-xl font-semibold text-foreground">Cadastros</h1>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="size-4" /></button>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="produtos">
            <TabsList className="mb-6">
              {[
                { id: 'produtos',  label: 'Produtos'  },
                { id: 'etapas',   label: 'Etapas'    },
                { id: 'metas',    label: 'Metas'     },
                { id: 'usuarios', label: 'Usuários'  },
              ].map(t => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                  <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full">{counts[t.id]}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="produtos">
              <TabProdutos products={products} refetch={refetchProducts} onError={setError} />
            </TabsContent>
            <TabsContent value="etapas">
              <TabEtapas stages={stages} refetch={refetchStages} onError={setError} />
            </TabsContent>
            <TabsContent value="metas">
              <TabMetas targets={targets} stages={stages} refetchTargets={refetchTargets} onError={setError} />
            </TabsContent>
            <TabsContent value="usuarios">
              <TabUsuarios operators={operators} refetch={refetchOperators} onError={setError} me={me} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
