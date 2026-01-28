import { Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import ServerDetail from "./pages/ServerDetail";
import Jobs from "./pages/Jobs";

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/servers/:id" element={<ServerDetail />} />
        <Route path="/jobs" element={<Jobs />} />
      </Routes>
    </AppLayout>
  );
}

export default App;
