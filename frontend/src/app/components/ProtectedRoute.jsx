// ─────────────────────────────────────────────────────────────
// ProtectedRoute.jsx — Guards authenticated routes (/app/*, /onboarding)
// If the user has not created an account or logged in, redirects to /login
// ─────────────────────────────────────────────────────────────
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        backgroundColor: "#f8fafc",
        fontFamily: "'Plus Jakarta Sans', Inter, sans-serif",
        color: "#64748b"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "40px",
            height: "40px",
            border: "3px solid #e2e8f0",
            borderTopColor: "#6366f1",
            borderRadius: "50%",
            margin: "0 auto 16px",
            animation: "spin 0.8s linear infinite"
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>Loading Sociva…</div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>Verifying your secure session</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect unauthenticated visitor to login, preserving intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
