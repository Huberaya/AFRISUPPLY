import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import AppLayout from './components/AppLayout';
import { Loader } from './components/ui';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Stock = lazy(() => import('./pages/Stock'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const SupplierDetail = lazy(() => import('./pages/SupplierDetail'));
const Compare = lazy(() => import('./pages/Compare'));
const Orders = lazy(() => import('./pages/Orders'));
const Recipes = lazy(() => import('./pages/Recipes'));
const Analysis = lazy(() => import('./pages/Analysis'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Catalog = lazy(() => import('./pages/Catalog'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Import = lazy(() => import('./pages/Import'));

// Port de ethimarket/src/components/ProtectedRoute.tsx
function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader /></div>;
  return user ? <Outlet /> : <Navigate to="/connexion" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader /></div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/connexion" element={<Login />} />
            <Route path="/inscription" element={<Register />} />
            <Route element={<Protected />}>
              <Route path="/app" element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="achats" element={<Orders />} />
                <Route path="achats/comparer/:productId" element={<Compare />} />
                <Route path="stock" element={<Stock />} />
                <Route path="fournisseurs" element={<Suppliers />} />
                <Route path="fournisseurs/:id" element={<SupplierDetail />} />
                <Route path="recettes" element={<Recipes />} />
                <Route path="analyse" element={<Analysis />} />
                <Route path="ia" element={<Assistant />} />
                <Route path="catalogue" element={<Catalog />} />
                <Route path="demarrer" element={<Onboarding />} />
                <Route path="import" element={<Import />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
