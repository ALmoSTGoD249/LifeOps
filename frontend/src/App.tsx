import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { NAV } from "./nav";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Placeholder from "./pages/Placeholder";
import Administration from "./pages/Administration";
import Profile from "./pages/Profile";
import IncidentList from "./pages/IncidentList";
import IncidentDetail from "./pages/IncidentDetail";
import TaskList from "./pages/TaskList";
import TaskDetailPage from "./pages/TaskDetail";
import MyWork from "./pages/MyWork";
import Catalog from "./pages/Catalog";
import CatalogManage from "./pages/CatalogManage";
import Requests from "./pages/Requests";
import RequestDetail from "./pages/RequestDetail";
import Assets from "./pages/Assets";
import AssetDetailPage from "./pages/AssetDetail";
import Maintenance from "./pages/Maintenance";
import MaintenanceDetail from "./pages/MaintenanceDetail";
import KnowledgeBase from "./pages/KnowledgeBase";
import ArticleView from "./pages/ArticleView";
import ArticleEditor from "./pages/ArticleEditor";

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-dvh"><Spinner /></div>;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="profile" element={<Profile />} />
        <Route path="admin" element={user.role === "admin" ? <Administration /> : <Navigate to="/" replace />} />
        <Route path="incidents" element={<IncidentList />} />
        <Route path="incidents/:number" element={<IncidentDetail />} />
        <Route path="tasks" element={<TaskList />} />
        <Route path="tasks/:number" element={<TaskDetailPage />} />
        <Route path="my-work" element={<MyWork />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="catalog/manage" element={user.role === "admin" ? <CatalogManage /> : <Navigate to="/catalog" replace />} />
        <Route path="requests" element={<Requests />} />
        <Route path="requests/:number" element={<RequestDetail />} />
        <Route path="assets" element={<Assets />} />
        <Route path="assets/:number" element={<AssetDetailPage />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="maintenance/:number" element={<MaintenanceDetail />} />
        <Route path="knowledge" element={<KnowledgeBase />} />
        <Route path="knowledge/new" element={<ArticleEditor />} />
        <Route path="knowledge/:number" element={<ArticleView />} />
        <Route path="knowledge/:number/edit" element={<ArticleEditor />} />
        {NAV.filter((n) => n.phase > 1 && !["/incidents", "/tasks", "/my-work", "/catalog", "/requests", "/assets", "/maintenance", "/knowledge"].includes(n.path)).map((n) => <Route key={n.path} path={n.path.slice(1)} element={<Placeholder item={n} />} />)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
