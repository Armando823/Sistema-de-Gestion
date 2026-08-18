import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './app/layouts/AdminLayout';
import ClientLayout from './app/layouts/ClientLayout';
import DashboardPage from './app/routes/admin/DashboardPage';
import ClientAccessPage from './app/routes/client/ClientAccessPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />} />
        <Route path="/*" element={<ClientLayout />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;