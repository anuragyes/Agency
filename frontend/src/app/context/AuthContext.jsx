// ─────────────────────────────────────────────────────────────
// AuthContext.jsx — User Authentication State & Provider
// ─────────────────────────────────────────────────────────────
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { API_BASE } from "../../api/productApi";

const AuthContext = createContext(null);

const TOKEN_KEY = "sociva_token";
const USER_KEY = "sociva_user";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);

  // Sync token & user to localStorage
  const saveAuth = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    try {
      if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
      else localStorage.removeItem(TOKEN_KEY);

      if (newUser) localStorage.setItem(USER_KEY, JSON.stringify(newUser));
      else localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.warn("[Auth] Failed to write to localStorage:", e);
    }
  }, []);

  const logout = useCallback(() => {
    saveAuth(null, null);
    try {
      localStorage.removeItem("sociva.currentProductId");
    } catch {
      /* ignore */
    }
  }, [saveAuth]);

  // Verify token on initial mount
  useEffect(() => {
    let active = true;

    async function checkAuth() {
      if (!token) {
        if (active) setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/user/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          throw new Error("Token expired or invalid");
        }

        const data = await res.json();
        if (active && data.success && data.user) {
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        } else {
          throw new Error("Invalid response");
        }
      } catch (err) {
        console.warn("[Auth] Session expired or invalid, logging out:", err.message);
        if (active) {
          logout();
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    checkAuth();

    return () => {
      active = false;
    };
  }, [token, logout]);

  // Signup with Name, Email, Password
  const signup = useCallback(
    async ({ name, email, password }) => {
      const res = await fetch(`${API_BASE}/api/user/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to create account");
      }

      saveAuth(data.token, data.user);
      return data;
    },
    [saveAuth]
  );

  // Signin with Email and Password
  const login = useCallback(
    async ({ email, password }) => {
      const res = await fetch(`${API_BASE}/api/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to sign in");
      }

      saveAuth(data.token, data.user);
      return data;
    },
    [saveAuth]
  );

  // Signin / Signup with Google OAuth (ID token or access token)
  const loginWithGoogle = useCallback(
    async (credentialOrPayload) => {
      const payload =
        typeof credentialOrPayload === "string"
          ? { credential: credentialOrPayload }
          : credentialOrPayload;

      const res = await fetch(`${API_BASE}/api/user/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Google sign-in failed");
      }

      saveAuth(data.token, data.user);
      return data;
    },
    [saveAuth]
  );

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    signup,
    login,
    loginWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
