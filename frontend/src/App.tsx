import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Inicio from './pages/Inicio'
import NoEncontrado from './pages/NoEncontrado'

/** Definición de rutas. En las siguientes partes se agregan login, paneles por rol, etc. */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  )
}
