// AppRoot.jsx — providers + styles shared by /app/* and /onboarding
import { Outlet } from "react-router-dom";
import { ToastProvider } from "./ui/kit";
import { WorkspaceProvider } from "./store";
import "./app.css";

export default function AppRoot() {
  return (
    <WorkspaceProvider>
      <ToastProvider>
        <div className="sa-root">
          <Outlet />
        </div>
      </ToastProvider>
    </WorkspaceProvider>
  );
}
