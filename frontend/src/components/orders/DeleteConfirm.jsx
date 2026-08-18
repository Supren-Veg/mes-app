import { useState } from 'react';
import { api } from '../../api/client';

export default function DeleteConfirm({ order, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/orders/${order.id}`);
      onDeleted();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-base font-semibold text-muted-foreground">Excluir Ordem</h2>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir a ordem de <strong>{order.product_name}</strong> em{' '}
          <strong>{order.production_date}</strong>? Esta ação não pode ser desfeita.
        </p>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded border text-sm text-muted-foreground hover:bg-muted">
            Cancelar
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="px-4 py-1.5 rounded bg-destructive hover:bg-destructive text-white text-sm disabled:opacity-50">
            {deleting ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  );
}
