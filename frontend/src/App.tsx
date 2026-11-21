import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import PanelLayout from './components/PanelLayout'
import RutaProtegida from './components/RutaProtegida'
import Inicio from './pages/Inicio'
import NoEncontrado from './pages/NoEncontrado'
import Prohibido from './pages/Prohibido'
import Estado from './pages/Estado'
import Login from './pages/auth/Login'
import Registro from './pages/auth/Registro'
import Recuperar from './pages/auth/Recuperar'
import NuevaPassword from './pages/auth/NuevaPassword'
import MfaConfigurar from './pages/auth/MfaConfigurar'
import MfaVerificar from './pages/auth/MfaVerificar'
import Perfil from './pages/panel/Perfil'
import { EnConstruccion } from './pages/panel/Paneles'
import JugadorInicio from './pages/jugador/Inicio'
import MisReservas from './pages/jugador/Reservas'
import PagoExito from './pages/pago/Exito'
import PagoCancelado from './pages/pago/Cancelado'

// Carga diferida: el mapa (Leaflet) y los gráficos (Recharts) solo se descargan
// cuando se abre una página que los usa. Así la primera carga es más liviana.
const Buscar = lazy(() => import('./pages/canchas/Buscar'))
const Detalle = lazy(() => import('./pages/canchas/Detalle'))
const PropietarioDashboard = lazy(() => import('./pages/propietario/Dashboard'))
const MisComplejos = lazy(() => import('./pages/propietario/Complejos'))
const EditarComplejo = lazy(() => import('./pages/propietario/Complejos').then((m) => ({ default: m.EditarComplejo })))
const Agenda = lazy(() => import('./pages/propietario/Agenda'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminUsuarios = lazy(() => import('./pages/admin/Usuarios'))
const AdminComplejos = lazy(() => import('./pages/admin/Complejos'))
const AdminActividad = lazy(() => import('./pages/admin/Actividad'))
const AdminConfiguracion = lazy(() => import('./pages/admin/Configuracion'))
const SolicitarComplejo = lazy(() => import('./pages/jugador/SolicitarComplejo'))

/**
 * Mapa de rutas:
 *  - Públicas: landing, buscar canchas (lista/mapa), detalle del complejo, login, registro, recuperar contraseña.
 *  - MFA: configurar / verificar (requieren sesión; la página lo controla).
 *  - Privadas por rol: /admin/*, /propietario/*, /jugador/* (RutaProtegida).
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Públicas */}
        <Route index element={<Inicio />} />
        <Route path="canchas" element={<Buscar />} />
        <Route path="canchas/:complejoId" element={<Detalle />} />
        <Route path="login" element={<Login />} />
        <Route path="registro" element={<Registro />} />
        <Route path="recuperar" element={<Recuperar />} />
        <Route path="nueva-password" element={<NuevaPassword />} />
        <Route path="mfa/configurar" element={<MfaConfigurar />} />
        <Route path="mfa/verificar" element={<MfaVerificar />} />
        <Route path="403" element={<Prohibido />} />
        <Route path="estado" element={<Estado />} />

        {/* Cualquier usuario logueado */}
        <Route element={<RutaProtegida />}>
          <Route element={<PanelLayout />}>
            <Route path="perfil" element={<Perfil />} />
          </Route>
          {/* Regreso desde Stripe Checkout */}
          <Route path="pago/exito" element={<PagoExito />} />
          <Route path="pago/cancelado" element={<PagoCancelado />} />
        </Route>

        {/* Panel por rol */}
        <Route path="admin" element={<RutaProtegida roles={['admin']} />}>
          <Route element={<PanelLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="usuarios" element={<AdminUsuarios />} />
            <Route path="complejos" element={<AdminComplejos />} />
            <Route path="actividad" element={<AdminActividad />} />
            <Route path="configuracion" element={<AdminConfiguracion />} />
            <Route path="*" element={<EnConstruccion />} />
          </Route>
        </Route>
        <Route path="propietario" element={<RutaProtegida roles={['propietario']} />}>
          <Route element={<PanelLayout />}>
            <Route index element={<PropietarioDashboard />} />
            <Route path="complejos" element={<MisComplejos />} />
            <Route path="complejos/:id" element={<EditarComplejo />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="*" element={<EnConstruccion />} />
          </Route>
        </Route>
        <Route path="jugador" element={<RutaProtegida roles={['jugador']} />}>
          <Route element={<PanelLayout />}>
            <Route index element={<JugadorInicio />} />
            <Route path="reservas" element={<MisReservas />} />
            <Route path="solicitar-complejo" element={<SolicitarComplejo />} />
            <Route path="*" element={<EnConstruccion />} />
          </Route>
        </Route>

        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  )
}
