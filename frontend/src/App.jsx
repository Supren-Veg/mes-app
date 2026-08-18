import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useApi }         from './hooks/useApi';
import Dashboard          from './pages/Dashboard';
import Orders             from './pages/Orders';
import OrderDetail        from './pages/OrderDetail';
import NewOrder           from './pages/NewOrder';
import Cadastros          from './pages/Cadastros';
import ProductAnalysis    from './pages/ProductAnalysis';
import OperatorAnalysis   from './pages/OperatorAnalysis';
import Tablet             from './pages/Tablet';
import Login              from './pages/Login';
import ChangePassword     from './pages/ChangePassword';
import { Separator }  from '@/components/ui/separator';
import { Badge }      from '@/components/ui/badge';
import { Button }     from '@/components/ui/button';
import {
  LayoutDashboard,
  ClipboardList,
  PlusCircle,
  BarChart2,
  Users,
  Settings,
  LogOut,
  LogIn,
  ChefHat,
} from 'lucide-react';

const navBase = [
  { to: '/',                  label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/analysis',          label: 'Por Etapa',     icon: BarChart2 },
  { to: '/operator-analysis', label: 'Por Operador',  icon: Users },
  { to: '/orders',            label: 'Ordens',        icon: ClipboardList, pendingBadge: true },
  { to: '/orders/new',        label: 'Nova Ordem',    icon: PlusCircle, requiresAuth: true },
];

function ProtectedRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function Sidebar({ nav, user, isGuest, logout, pendingCount }) {
  return (
    <aside className="w-60 shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border min-h-screen">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary">
          <ChefHat className="size-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm text-sidebar-foreground">Dados Operacionais</span>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {nav.map(({ to, label, icon: Icon, pendingBadge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium bg-sidebar-accent text-primary'
                : 'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors'
            }
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {pendingBadge && pendingCount > 0 && (
              <Badge className="h-4 min-w-4 px-1 text-[10px] leading-none">{pendingCount}</Badge>
            )}
          </NavLink>
        ))}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User footer */}
      <div className="px-3 py-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold shrink-0">
            {isGuest ? 'G' : (user?.name?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-sidebar-foreground truncate">
              {isGuest ? 'Convidado' : user?.name}
            </span>
            {isGuest && <Badge variant="outline" className="text-[10px] w-fit px-1.5 py-0">Somente leitura</Badge>}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          {isGuest ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
          {isGuest ? 'Fazer login' : 'Sair'}
        </Button>
      </div>
    </aside>
  );
}

function AppShell() {
  const { token, user, logout, isGuest } = useAuth();
  const isAdmin    = user?.role === 'admin';
  const isAuxiliar = user?.role === 'producao';

  // Badge de ordens pendentes no nav
  const { data: pendingOrders } = useApi(token && !isAuxiliar ? '/orders?status=Pendente' : null);
  const pendingCount = pendingOrders?.length ?? 0;

  const navFiltered = navBase.filter(n => !n.requiresAuth || !isGuest);
  const nav = isAdmin
    ? [...navFiltered, { to: '/cadastros', label: 'Cadastros', icon: Settings }]
    : navFiltered;

  if (!token) {
    return (
      <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*"                element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Auxiliar de produção: acesso exclusivo à página tablet
  if (isAuxiliar) {
    return (
      <Routes>
        <Route path="/tablet"          element={<Tablet />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*"                element={<Navigate to="/tablet" replace />} />
      </Routes>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar nav={nav} user={user} isGuest={isGuest} logout={logout} pendingCount={pendingCount} />

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Routes>
            <Route path="/"                    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/analysis"            element={<ProtectedRoute><ProductAnalysis /></ProtectedRoute>} />
            <Route path="/operator-analysis"   element={<ProtectedRoute><OperatorAnalysis /></ProtectedRoute>} />
            <Route path="/orders"              element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/orders/new"          element={<ProtectedRoute><NewOrder /></ProtectedRoute>} />
            <Route path="/orders/:id"          element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
            <Route path="/cadastros"           element={<AdminRoute><Cadastros /></AdminRoute>} />
            <Route path="/change-password"     element={<ChangePassword />} />
            <Route path="*"                    element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
