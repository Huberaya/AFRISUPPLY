import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import AppLayout from './components/AppLayout';
import SiteLayout from './components/site/SiteLayout';
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
const Forecast = lazy(() => import('./pages/Forecast'));
const SmartCart = lazy(() => import('./pages/SmartCart'));
const Marketplace = lazy(() => import('./pages/Marketplace'));
const VendorSpace = lazy(() => import('./pages/vendor/VendorSpace'));
const AdminVendors = lazy(() => import('./pages/admin/AdminVendors'));
const Sales = lazy(() => import('./pages/Sales'));
const Discrepancies = lazy(() => import('./pages/Discrepancies'));
const Settings = lazy(() => import('./pages/Settings'));
const Express = lazy(() => import('./pages/Express'));
const Home = lazy(() => import('./pages/site/Home'));
const Pricing = lazy(() => import('./pages/site/Pricing'));
const Features = lazy(() => import('./pages/site/Features'));
const Faq = lazy(() => import('./pages/site/Faq'));
const RequestAccess = lazy(() => import('./pages/site/RequestAccess'));
const Legal = lazy(() => import('./pages/site/Legal'));
const Terms = lazy(() => import('./pages/site/Terms'));
const StatusPage = lazy(() => import('./pages/site/Status'));

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
            <Route element={<SiteLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/tarifs" element={<Pricing />} />
              <Route path="/fonctionnalites" element={<Features />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/demander-un-acces" element={<RequestAccess />} />
              <Route path="/mentions-legales" element={<Legal />} />
              <Route path="/cgv" element={<Terms />} />
              <Route path="/statut" element={<StatusPage />} />
            </Route>
            <Route path="/connexion" element={<Login />} />
            <Route path="/fournisseur" element={<VendorSpace />} />
            <Route path="/inscription" element={<Register />} />
            <Route element={<Protected />}>
              <Route path="/app" element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="achats" element={<Orders />} />
                <Route path="achats/comparer/:productId" element={<Compare />} />
                <Route path="stock" element={<Stock />} />
                <Route path="stock/prevision" element={<Forecast />} />
                <Route path="achats/panier" element={<SmartCart />} />
                <Route path="achats/ecarts" element={<Discrepancies />} />
                <Route path="ventes" element={<Sales />} />
                <Route path="fournisseurs" element={<Suppliers />} />
                <Route path="marketplace" element={<Marketplace />} />
                <Route path="admin/fournisseurs" element={<AdminVendors />} />
                <Route path="fournisseurs/:id" element={<SupplierDetail />} />
                <Route path="recettes" element={<Recipes />} />
                <Route path="analyse" element={<Analysis />} />
                <Route path="ia" element={<Assistant />} />
                <Route path="catalogue" element={<Catalog />} />
                <Route path="demarrer" element={<Onboarding />} />
                <Route path="import" element={<Import />} />
                <Route path="parametres" element={<Settings />} />
                <Route path="express" element={<Express />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
