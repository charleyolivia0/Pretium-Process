import { useQuery } from "convex/react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { api } from "../convex/_generated/api";
import { RequireAuth } from "./components/RequireAuth";
import { AppLayout } from "./components/AppLayout";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import DailyReportDetail from "./pages/DailyReportDetail";
import IncidentReportDetail from "./pages/IncidentReportDetail";
import { ProjectDocumentFolder } from "./pages/ProjectDocumentFolder";
import { DocumentViewer } from "./pages/DocumentViewer";
import { Accounting } from "./pages/Accounting";
import { Admin } from "./pages/Admin";
import { Users } from "./pages/Users";
import { UserDetail } from "./pages/UserDetail";
import { Access } from "./pages/Access";
import { JobAccess } from "./pages/JobAccess";
import { Boardroom } from "./pages/Boardroom";
import { PersonalCalendar } from "./pages/PersonalCalendar";
import { Safety } from "./pages/Safety";
import { SafetyProject } from "./pages/SafetyProject";
import { SafetyProjectIncidents } from "./pages/SafetyProjectIncidents";
import { SafetyProjectTrades } from "./pages/SafetyProjectTrades";
import { SafetySubtradeEmployees } from "./pages/SafetySubtradeEmployees";
import { SubtradeContractTracking } from "./pages/SubtradeContractTracking";
import { Inventory } from "./pages/Inventory";
import { InventoryForm } from "./pages/InventoryForm";
import { Account } from "./pages/Account";
import { WeeklyUpdate } from "./pages/WeeklyUpdate";
import { WeeklyUpdatesList } from "./pages/WeeklyUpdatesList";
import { SafetyProjectJobSignInOutExternal } from "./pages/SafetyProjectJobSignInOutExternal";
import { SafetyProjectJobSignInOutLogs } from "./pages/SafetyProjectJobSignInOutLogs";
import { Companion } from "./pages/Companion";
import { Assistant } from "./pages/Assistant";
import { Drawings } from "./pages/Drawings";
import { DrawingProject } from "./pages/DrawingProject";
import { DrawingViewer } from "./pages/DrawingViewer";
import { SitePhotoViewer } from "./pages/SitePhotoViewer";
import { CloseOut } from "./pages/CloseOut";
import { CloseOutProject } from "./pages/CloseOutProject";
import { ProjectStartUp } from "./pages/ProjectStartUp";
import { ProjectStartUpSummary } from "./pages/ProjectStartUpSummary";
import { TaskPage } from "./pages/TaskPage";
import { ProjectDetailRouteStub } from "./pages/projectDetail/ProjectDetailRouteStub";
import { TradePortal } from "./pages/TradePortal";
import { AdminTradeLogins } from "./pages/AdminTradeLogins";
import { ProjectSiteContactSheet } from "./pages/ProjectSiteContactSheet";
import { Email } from "./pages/Email";

/** Old project submittals tab {"->"} Changes submittal workflow. */
function ProjectSubmittalsLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/projects" replace />;
  return <Navigate to={`/projects/${id}/changes/submittal`} replace />;
}

/** Old close-out section URLs {"->"} `/close-out/project/:projectId?tab=...` */
function CloseOutLegacyTabRedirect({ tab }: { tab: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return <Navigate to="/close-out" replace />;
  return <Navigate to={`/close-out/project/${projectId}?tab=${encodeURIComponent(tab)}`} replace />;
}

function DashboardRoute() {
  const user = useQuery(api.users.current);
  const viewAsRole =
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("pretium.viewAsRole") ?? "";
  const roleForDashboard = user?.role === "admin" && viewAsRole ? viewAsRole : user?.role;

  if (user === undefined) {
    return null;
  }

  if (roleForDashboard === "safety") {
    return <Navigate to="/safety" replace />;
  }

  if (roleForDashboard === "accounting") {
    return <Navigate to="/accounting" replace />;
  }

  if (roleForDashboard === "admin") {
    return <Admin />;
  }

  return <Dashboard />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/companion" element={<Companion />} />
      <Route path="/signup" element={<Navigate to="/login" replace />} />
      <Route path="/trade-portal" element={<TradePortal />} />
      <Route path="/inventory-form" element={<InventoryForm />} />
      <Route
        path="/safety/project/:projectId/job-sign-in-out/external"
        element={<SafetyProjectJobSignInOutExternal />}
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardRoute />} />
        <Route path="/tasks/new" element={<TaskPage />} />
        <Route path="/weekly" element={<WeeklyUpdate />} />
        <Route path="/weekly-updates" element={<WeeklyUpdatesList />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/project-start-up" element={<ProjectStartUp />} />
        <Route path="/project-start-up/summary/:id" element={<ProjectStartUpSummary />} />
        <Route path="/drawings" element={<Drawings />} />
        <Route path="/drawings/project/:projectId/drawing/:drawingId" element={<DrawingViewer />} />
        <Route path="/drawings/project/:projectId" element={<DrawingProject />} />
        <Route path="/close-out" element={<CloseOut />} />
        <Route path="/close-out/project/:projectId" element={<CloseOutProject />} />
        <Route
          path="/close-out/project/:projectId/as-built"
          element={<CloseOutLegacyTabRedirect tab="as-built" />}
        />
        <Route
          path="/close-out/project/:projectId/o-and-m"
          element={<CloseOutLegacyTabRedirect tab="o-and-m" />}
        />
        <Route
          path="/close-out/project/:projectId/warranty"
          element={<CloseOutLegacyTabRedirect tab="warranty" />}
        />
        <Route
          path="/close-out/project/:projectId/certification"
          element={<CloseOutLegacyTabRedirect tab="certification" />}
        />
        <Route
          path="/close-out/project/:projectId/shop-drawings"
          element={<CloseOutLegacyTabRedirect tab="shop-drawings" />}
        />
        <Route path="/projects/:id" element={<ProjectDetail />}>
          <Route index element={<ProjectDetailRouteStub />} />
          <Route path="daily-reports" element={<ProjectDetailRouteStub />} />
          <Route path="tasks" element={<Navigate to="../daily-reports" replace />} />
          <Route path="submittals" element={<ProjectSubmittalsLegacyRedirect />} />
          <Route path="subtrades" element={<ProjectDetailRouteStub />} />
          <Route path="subtrades/:subtradeId" element={<ProjectDetailRouteStub />} />
          <Route path="schedule" element={<ProjectDetailRouteStub />} />
          <Route path="budget" element={<ProjectDetailRouteStub />} />
          <Route path="inventory" element={<ProjectDetailRouteStub />} />
          <Route path="safety" element={<ProjectDetailRouteStub />} />
          <Route path="site-photos" element={<ProjectDetailRouteStub />} />
          <Route path="miscellaneous" element={<ProjectDetailRouteStub />} />
          <Route path="changes/*" element={<ProjectDetailRouteStub />} />
        </Route>
        <Route path="/projects/:projectId/folders/:folderId" element={<ProjectDocumentFolder />} />
        <Route path="/projects/:projectId/documents/:documentId/view" element={<DocumentViewer />} />
        <Route path="/projects/:projectId/daily-report/:reportId" element={<DailyReportDetail />} />
        <Route path="/projects/:projectId/site-photos/:photoId/markup" element={<SitePhotoViewer />} />
        <Route path="/projects/:projectId/site-contact-sheet" element={<ProjectSiteContactSheet />} />
        <Route path="/projects/:projectId/incident-report/:reportId" element={<IncidentReportDetail />} />
        <Route path="/accounting" element={<Accounting />} />
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin/permissions" element={<Navigate to="/admin/users" replace />} />
        <Route path="/admin/users" element={<Users />} />
        <Route path="/admin/users/:userId" element={<UserDetail />} />
        <Route path="/admin/access" element={<Access />} />
        <Route path="/admin/job-access" element={<JobAccess />} />
        <Route path="/admin/trade-logins" element={<AdminTradeLogins />} />
        <Route path="/boardroom" element={<Boardroom />} />
        <Route path="/personal-calendar" element={<PersonalCalendar />} />
        <Route path="/estimating/*" element={<Navigate to="/dashboard" replace />} />
        <Route path="/estimating" element={<Navigate to="/dashboard" replace />} />
        <Route path="/safety" element={<Safety />} />
        <Route path="/safety/project/:id" element={<SafetyProject />} />
        <Route path="/safety/project/:id/incidents" element={<SafetyProjectIncidents />} />
        <Route path="/safety/project/:id/trades" element={<SafetyProjectTrades />} />
        <Route
          path="/safety/project/:projectId/job-sign-in-out"
          element={<SafetyProjectJobSignInOutLogs />}
        />
        <Route path="/safety/project/:projectId/subtrade/:subtradeId" element={<SafetySubtradeEmployees />} />
        <Route path="/projects/:projectId/subtrade/:subtradeId/contracts" element={<SubtradeContractTracking />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/email" element={<Email />} />
        <Route path="/account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
