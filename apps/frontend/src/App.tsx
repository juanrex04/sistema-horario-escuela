import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./components/Login";
import Layout from "./components/Layout";
import Horario from "./pages/Horario";
import Docentes from "./pages/Docentes";
import Cursos from "./pages/Cursos";
import Materias from "./pages/Materias";
import Cargas from "./pages/Cargas";
import Bloques from "./pages/Bloques";

function Shell() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/horario" replace />} />
        <Route path="/horario" element={<Horario />} />
        <Route path="/docentes" element={<Docentes />} />
        <Route path="/cursos" element={<Cursos />} />
        <Route path="/materias" element={<Materias />} />
        <Route path="/cargas" element={<Cargas />} />
        <Route path="/bloques" element={<Bloques />} />
        <Route path="*" element={<Navigate to="/horario" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}