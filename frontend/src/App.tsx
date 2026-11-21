import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import PanelLayout from './components/PanelLayout'
import RutaProtegida from './components/RutaProtegida'
import Inicio from './pages/Inicio'
import NoEncontrado from './pages/NoEncontrado'
import Prohibido from './pages/Prohibido'
import Login from './pages/auth/Login'
import Registro from './pages/auth/Registro'
import Recuperar from './pages/auth/Recuperar'
import NuevaPassword from './pages/auth/NuevaPassword'
import MfaConfigurar from './pages/auth/MfaConfigurar'
import MfaVerificar from './pages/auth/MfaVerificar'
import Perfil from './pages/panel/Perfil'
import { AdminInicio, EnConstruccion, PropietarioInicio } from './pages/panel/Paneles'
import Buscar from './pages/canchas/Buscar'
import Detalle from './pages/canchas/Detalle'
import JugadorInicio from './pages/jugador/Inicio'
import MisReservas from './pages/jugador/Reservas'

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

        {/* Cualquier usuario logueado */}
        <Route element={<RutaProtegida />}>
          <Route element={<PanelLayout />}>
            <Route path="perfil" element={<Perfil />} />
          </Route>
        </Route>

        {/* Panel por rol */}
        <Route path="admin" element={<RutaProtegida roles={['admin']} />}>
          <Route element={<PanelLayout />}>
            <Route index element={<AdminInicio />} />
            <Route path="*" element={<EnConstruccion />} />
          </Route>
        </Route>
        <Route path="propietario" element={<RutaProtegida roles={['propietario']} />}>
          <Route element={<PanelLayout />}>
            <Route index element={<PropietarioInicio />} />
            <Route path="*" element={<EnConstruccion />} />
          </Route>
        </Route>
        <Route path="jugador" element={<RutaProtegida roles={['jugador']} />}>
          <Route element={<PanelLayout />}>
            <Route index element={<JugadorInicio />} />
            <Route path="reservas" element={<MisReservas />} />
            <Route path="*" element={<EnConstruccion />} />
          </Route>
        </Route>

        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  )
}
