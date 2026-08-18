import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api }    from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { KeyRound } from 'lucide-react';

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [form,    setForm]    = useState({ password: '', confirm: '' });
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm)
      return setError('As senhas não coincidem.');
    if (form.password.length < 6)
      return setError('A senha deve ter no mínimo 6 caracteres.');
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/change-password', { password: form.password });
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center pb-2">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary mb-3">
            <KeyRound className="size-5 text-primary-foreground" />
          </div>
          <CardTitle className="text-base font-semibold text-foreground">Definir nova senha</CardTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            Olá, {user?.name}. Por segurança, defina uma senha pessoal.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <p className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md px-3 py-2 text-center">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password" type="password" required autoFocus
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input
                id="confirm" type="password" required
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full mt-1">
              {loading ? 'Salvando…' : 'Salvar senha'}
            </Button>
          </form>

          <button onClick={logout}
            className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors">
            Sair e fazer login com outra conta
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
