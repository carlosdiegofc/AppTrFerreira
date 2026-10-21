import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Gate } from './auth/Gate';
import { Skeleton } from './components/ui';
import { AppShell } from './layout/AppShell';
import { Proximamente } from './pages/Proximamente';
import { SECTIONS } from './sections';

// The map library loads after signing in, so the sign-in screen opens fast.
const Inicio = lazy(() => import('./pages/Inicio').then((m) => ({ default: m.Inicio })));
const Gps = lazy(() => import('./pages/Gps').then((m) => ({ default: m.Gps })));
const Viajes = lazy(() => import('./pages/Viajes').then((m) => ({ default: m.Viajes })));
const Viaje = lazy(() => import('./pages/Viaje').then((m) => ({ default: m.Viaje })));
const Combustible = lazy(() => import('./pages/Combustible').then((m) => ({ default: m.Combustible })));
const Estacion = lazy(() => import('./pages/Estacion').then((m) => ({ default: m.Estacion })));
const Mantenimiento = lazy(() => import('./pages/Mantenimiento').then((m) => ({ default: m.Mantenimiento })));
const Documentacion = lazy(() => import('./pages/Documentacion').then((m) => ({ default: m.Documentacion })));

const loading = (
  <div className="page">
    <Skeleton lines={4} />
  </div>
);

export function App() {
  return (
    <Routes>
      <Route element={<Gate />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/inicio" replace />} />
          <Route path="inicio" element={<Suspense fallback={loading}><Inicio /></Suspense>} />
          <Route path="gps" element={<Suspense fallback={loading}><Gps /></Suspense>} />
          <Route path="viajes" element={<Suspense fallback={loading}><Viajes /></Suspense>} />
          <Route path="viajes/:key" element={<Suspense fallback={loading}><Viaje /></Suspense>} />
          <Route path="combustible" element={<Suspense fallback={loading}><Combustible /></Suspense>} />
          <Route path="combustible/estaciones/:key" element={<Suspense fallback={loading}><Estacion /></Suspense>} />
          <Route path="mantenimiento" element={<Suspense fallback={loading}><Mantenimiento /></Suspense>} />
          <Route path="documentacion" element={<Suspense fallback={loading}><Documentacion /></Suspense>} />
          {SECTIONS.filter((s) => !s.ready).map((s) => (
            <Route key={s.path} path={s.path} element={<Proximamente section={s} />} />
          ))}
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
