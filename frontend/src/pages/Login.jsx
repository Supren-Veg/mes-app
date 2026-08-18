import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api }    from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ChefHat, LogIn } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form,    setForm]    = useState({ email: '', password: '' });
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', form);
      login(res.token, res.user);
      if (res.password_change_required) {
        navigate('/change-password');
      } else {
        navigate('/');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGuest() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/auth/guest-token');
      login(res.token, res.user);
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
            <ChefHat className="size-5 text-primary-foreground" />
          </div>
          <CardTitle className="text-base font-semibold text-foreground">Dados Operacionais</CardTitle>
          <p className="text-sm text-muted-foreground mt-0.5">Acesso ao sistema</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <p className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md px-3 py-2 text-center">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" required autoFocus
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password" type="password" required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full mt-1">
              <LogIn className="size-4" />
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">ou</span>
            <Separator className="flex-1" />
          </div>

          <Button variant="outline" onClick={handleGuest} disabled={loading} className="w-full">
            Entrar como Convidado
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
