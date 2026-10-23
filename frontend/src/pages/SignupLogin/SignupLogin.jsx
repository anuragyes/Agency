import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../app/context/AuthContext";
import "./SignupLogin.css";

/**
 * Sociva AI – Sign in / Create account page
 * Routes:  /login  -> <AuthPage mode="signin" />
 *          /signup -> <AuthPage mode="signup" />
 */

/* ---------- Icons ---------- */
const LogoIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
    <path d="M20 12a8 8 0 1 1-3-6.25" />
    <circle cx="12" cy="12" r="3.2" />
    <circle cx="18.5" cy="5.5" r="1.4" fill="#fff" stroke="none" />
  </svg>
);
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
const AppleIcon = () => (
  <svg width="16" height="18" viewBox="0 0 384 512" fill="#fff">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);
const UserIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a8f9e" strokeWidth="1.6">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </svg>
);
const Mail = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a8f9e" strokeWidth="1.6">
    <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
  </svg>
);
const Lock = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a8f9e" strokeWidth="1.6">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);
const Eye = ({ off }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a8f9e" strokeWidth="1.6">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);
const Arrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const Shield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
const Sparkle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </svg>
);
const Bot = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
    <rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01" />
  </svg>
);
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
);

const Avatar = ({ t, bg }) => <div className="sv-av" style={{ background: bg }}>{t}</div>;

const ReachChart = () => (
  <svg viewBox="0 0 530 150" width="100%" height="130" style={{ marginTop: 10, display: "block" }} preserveAspectRatio="none">
    <defs>
      <linearGradient id="svFill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#d8b4fe" stopOpacity=".35" />
        <stop offset="100%" stopColor="#d8b4fe" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="svLine" x1="0" x2="1">
        <stop offset="0%" stopColor="#c4b5fd" /><stop offset="100%" stopColor="#f0abfc" />
      </linearGradient>
    </defs>
    <line x1="0" x2="530" y1="12" y2="12" stroke="rgba(255,255,255,.2)" strokeDasharray="4 5" />
    <line x1="0" x2="530" y1="76" y2="76" stroke="rgba(255,255,255,.15)" strokeDasharray="4 5" />
    <line x1="0" x2="530" y1="142" y2="142" stroke="rgba(255,255,255,.15)" />
    <path d="M0 110 C40 98,70 92,120 100 S180 104,210 92 S260 72,300 84 S350 74,390 66 S430 80,460 64 S510 46,530 42 L530 150 L0 150Z" fill="url(#svFill)" />
    <path d="M0 110 C40 98,70 92,120 100 S180 104,210 92 S260 72,300 84 S350 74,390 66 S430 80,460 64 S510 46,530 42" fill="none" stroke="url(#svLine)" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/* ---------- Validation ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(mode, { name, email, password, confirm }) {
  const errors = {};
  if (mode === "signup" && name.trim().length < 2) errors.name = "Please enter your full name.";
  if (!email.trim()) errors.email = "Email is required.";
  else if (!EMAIL_RE.test(email.trim())) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Password is required.";
  else if (mode === "signup" && password.length < 8) errors.password = "Use at least 8 characters.";
  if (mode === "signup" && confirm !== password) errors.confirm = "Passwords don't match.";
  return errors;
}

const EMPTY = { name: "", email: "", password: "", confirm: "" };

/* ---------- Page ---------- */
export default function AuthPage({ mode = "signin" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signup, login, loginWithGoogle, isAuthenticated } = useAuth();
  const isSignup = mode === "signup";

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [alert, setAlert] = useState(null); // { type: "ok" | "err" | "info", text }

  // If already authenticated, redirect straight to /app/accounts
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/app/accounts", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Reset form state whenever the user switches between /login and /signup
  useEffect(() => {
    setErrors({});
    setTouched({});
    setAlert(null);
    setShow(false);
    setGoogleLoading(false);
    setValues((v) => ({ ...EMPTY, email: v.email }));
    document.title = isSignup ? "Create account · Sociva" : "Sign in · Sociva";
  }, [isSignup]);

  const onChange = (field) => (e) => {
    const next = { ...values, [field]: e.target.value };
    setValues(next);
    if (touched[field]) setErrors(validate(mode, next));
  };

  const onBlur = (field) => () => {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors(validate(mode, values));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const found = validate(mode, values);
    setErrors(found);
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (Object.keys(found).length) return;

    setLoading(true);
    setAlert(null);
    try {
      if (isSignup) {
        await signup({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
        });
        setAlert({
          type: "ok",
          text: "Account created! Opening your account…",
        });
        setTimeout(() => navigate("/app/accounts"), 800);
      } else {
        await login({
          email: values.email.trim(),
          password: values.password,
        });
        setAlert({
          type: "ok",
          text: "Signed in! Opening your account…",
        });
        const fromPath = location.state?.from?.pathname;
        const destination =
          fromPath && fromPath !== "/onboarding" && fromPath !== "/login" && fromPath !== "/signup"
            ? fromPath
            : "/app/accounts";
        setTimeout(() => navigate(destination), 800);
      }
    } catch (err) {
      setAlert({
        type: "err",
        text: err?.message || "Authentication failed. Please check your credentials.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId || clientId.includes("your_google_client_id")) {
      setAlert({
        type: "info",
        text: "Google OAuth is ready on the backend! Please set your VITE_GOOGLE_CLIENT_ID in frontend/.env to enable direct Google sign-in. In the meantime, you can sign up / sign in with Email & Password.",
      });
      return;
    }

    // Immediately disable the button and show working/loading indicator
    setGoogleLoading(true);
    setAlert(null);

    // Safety timeout: if popup closed without event or network hangs, restore button after 45s
    const safetyTimer = setTimeout(() => {
      setGoogleLoading(false);
    }, 45000);

    const finishSuccess = async (payload) => {
      clearTimeout(safetyTimer);
      try {
        await loginWithGoogle(payload);
        setAlert({ type: "ok", text: "Signed in with Google! Opening your account…" });
        const fromPath = location.state?.from?.pathname;
        const destination =
          fromPath && fromPath !== "/onboarding" && fromPath !== "/login" && fromPath !== "/signup"
            ? fromPath
            : "/app/accounts";
        setTimeout(() => navigate(destination), 800);
      } catch (err) {
        console.error("[GoogleAuth] Backend auth error:", err);
        setAlert({ type: "err", text: err?.message || "Google sign-in failed on backend." });
        setGoogleLoading(false);
      }
    };

    const finishError = (message) => {
      clearTimeout(safetyTimer);
      setGoogleLoading(false);
      if (message) {
        setAlert({ type: "err", text: message });
      }
    };

    // Approach 1: Modern Google Identity Services OAuth2 Token Client (Recommended for custom button clicks)
    if (window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "email profile openid",
          callback: async (tokenResponse) => {
            console.log("[GoogleAuth] Token response received:", tokenResponse);
            if (tokenResponse?.error) {
              const desc = tokenResponse.error_description || tokenResponse.error;
              let friendly = `Google sign-in error: ${desc}`;
              if (typeof desc === "string" && (desc.toLowerCase().includes("origin") || desc.toLowerCase().includes("not allowed"))) {
                friendly = "Google origin mismatch: Please make sure http://localhost:5173 and http://localhost are added to 'Authorized JavaScript origins' in your Google Cloud Console.";
              }
              finishError(friendly);
              return;
            }
            if (tokenResponse?.access_token) {
              await finishSuccess({ accessToken: tokenResponse.access_token });
            } else {
              finishError("No access token returned by Google.");
            }
          },
          error_callback: (err) => {
            console.warn("[GoogleAuth] OAuth popup error or closed:", err);
            let msg = "Google sign-in popup was closed or cancelled.";
            if (err?.type === "popup_failed_to_open") {
              msg = "Google sign-in popup was blocked by your browser. Please allow popups for localhost:5173.";
            } else if (err?.type === "popup_closed") {
              msg = "Google sign-in was cancelled.";
            } else if (err?.message) {
              msg = err.message;
            }
            finishError(msg);
          },
        });

        // Trigger Google OAuth popup dialog
        tokenClient.requestAccessToken({ prompt: "" });
        return;
      } catch (err) {
        console.warn("[GoogleAuth] oauth2.initTokenClient error, falling back to id.initialize:", err);
      }
    }

    // Approach 2: Google ID token initialization fallback
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          use_fedcm_for_prompt: false,
          callback: async (response) => {
            if (response.credential) {
              await finishSuccess({ credential: response.credential });
            } else {
              finishError("No credential returned.");
            }
          },
        });
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.warn("[GoogleAuth] Prompt not displayed:", notification.getNotDisplayedReason());
            finishError("Google sign-in prompt was suppressed by browser. Please enable popups or try Email & Password.");
          }
        });
        return;
      } catch (err) {
        console.warn("[GoogleAuth] id.prompt error:", err);
        finishError("Failed to launch Google sign-in.");
      }
    } else {
      // Script not yet loaded, load it and retry
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => handleGoogleSignIn();
      script.onerror = () => finishError("Could not load Google Sign-In script. Please check your network or ad-blocker.");
      document.body.appendChild(script);
    }
  };

  const social = (provider) => {
    if (provider === "Google") {
      handleGoogleSignIn();
    } else {
      setAlert({
        type: "info",
        text: `${provider} sign-in is coming soon! Please use Email & Password or Google.`,
      });
    }
  };

  const fieldErr = (f) => touched[f] && errors[f];

  return (
    <div className="sv-root">
      {/* LEFT */}
      <div className="sv-left">
        <div className="sv-left-inner">
          <Link to="/" className="sv-logo" aria-label="Sociva home">
            <div className="sv-logo-mark"><LogoIcon /></div>
            <span className="sv-logo-name">Sociva</span>
            <span className="sv-logo-badge">AI</span>
          </Link>

          <form className="sv-form" onSubmit={onSubmit} noValidate>
            <div className="sv-tabs" role="tablist">
              <Link to="/login" role="tab" aria-selected={!isSignup} className={`sv-tab ${!isSignup ? "active" : ""}`}>Sign in</Link>
              <Link to="/signup" role="tab" aria-selected={isSignup} className={`sv-tab ${isSignup ? "active" : ""}`}>Create account</Link>
            </div>

            <h1 className="sv-h1">{isSignup ? "Create your account" : "Welcome back"}</h1>
            <p className="sv-sub">
              {isSignup ? "Start putting your social growth on autopilot." : "Sign in to keep your social growth on autopilot."}
            </p>

            <div className="sv-social">
              <button
                type="button"
                className={googleLoading ? "sv-social-loading" : ""}
                disabled={googleLoading || loading}
                onClick={() => social("Google")}
                title={googleLoading ? "Connecting to Google..." : "Continue with Google"}
              >
                <span className="sv-ico" style={{ border: "1px solid #e6e7ee" }}>
                  {googleLoading ? (
                    <svg className="sv-social-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b4cf5" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                  ) : (
                    <GoogleIcon />
                  )}
                </span>
                {googleLoading ? "Connecting…" : "Google"}
              </button>
              <button
                type="button"
                disabled={googleLoading || loading}
                onClick={() => social("Apple")}
              >
                <span className="sv-ico" style={{ background: "#111" }}><AppleIcon /></span>
                Apple
              </button>
              <button
                type="button"
                disabled={googleLoading || loading}
                onClick={() => social("LinkedIn")}
              >
                <span className="sv-ico" style={{ background: "#0a66c2", color: "#fff", fontWeight: 700, fontSize: 14 }}>in</span>
                LinkedIn
              </button>
            </div>

            <div className="sv-divider">or continue with email</div>

            {alert && <div className={`sv-alert ${alert.type}`} role="status">{alert.text}</div>}

            {isSignup && (
              <div className="sv-group">
                <div className="sv-label-row"><label className="sv-label" htmlFor="sv-name">Full name</label></div>
                <div className={`sv-field ${fieldErr("name") ? "invalid" : ""}`}>
                  <UserIcon />
                  <input id="sv-name" type="text" autoComplete="name" value={values.name}
                    onChange={onChange("name")} onBlur={onBlur("name")} placeholder="Sarah Jones" />
                </div>
                {fieldErr("name") && <div className="sv-error">{errors.name}</div>}
              </div>
            )}

            <div className="sv-group">
              <div className="sv-label-row"><label className="sv-label" htmlFor="sv-email">Work email</label></div>
              <div className={`sv-field ${fieldErr("email") ? "invalid" : ""}`}>
                <Mail />
                <input id="sv-email" type="email" autoComplete="email" value={values.email}
                  onChange={onChange("email")} onBlur={onBlur("email")} placeholder="you@company.com" />
              </div>
              {fieldErr("email") && <div className="sv-error">{errors.email}</div>}
            </div>

            <div className="sv-group">
              <div className="sv-label-row">
                <label className="sv-label" htmlFor="sv-pass">Password</label>
                {!isSignup && (
                  <button type="button" className="sv-link"
                    onClick={() => setAlert({ type: "info", text: "Password reset is coming soon." })}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className={`sv-field ${fieldErr("password") ? "invalid" : ""}`}>
                <Lock />
                <input id="sv-pass" type={show ? "text" : "password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  value={values.password} onChange={onChange("password")} onBlur={onBlur("password")}
                  placeholder={isSignup ? "At least 8 characters" : "••••••••"} />
                <button type="button" className="sv-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
                  <Eye off={show} />
                </button>
              </div>
              {fieldErr("password") && <div className="sv-error">{errors.password}</div>}
            </div>

            {isSignup && (
              <div className="sv-group">
                <div className="sv-label-row"><label className="sv-label" htmlFor="sv-confirm">Confirm password</label></div>
                <div className={`sv-field ${fieldErr("confirm") ? "invalid" : ""}`}>
                  <Lock />
                  <input id="sv-confirm" type={show ? "text" : "password"} autoComplete="new-password"
                    value={values.confirm} onChange={onChange("confirm")} onBlur={onBlur("confirm")}
                    placeholder="Re-enter password" />
                </div>
                {fieldErr("confirm") && <div className="sv-error">{errors.confirm}</div>}
              </div>
            )}

            {!isSignup && (
              <label className="sv-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span className="sv-box">{remember && <Check />}</span>
                Keep me signed in for 30 days
              </label>
            )}
            {isSignup && <div style={{ height: 6 }} />}

            <button type="submit" className="sv-submit" disabled={loading || googleLoading}>
              {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"} {!loading && !googleLoading && <Arrow />}
            </button>

            <p className="sv-switch">
              {isSignup ? "Already have an account? " : "New to Sociva? "}
              <Link className="sv-link" to={isSignup ? "/login" : "/signup"}>
                {isSignup ? "Sign in" : "Create an account"}
              </Link>
            </p>

            <div className="sv-secure"><Shield /> Protected with SSO &amp; 2-factor authentication</div>
          </form>

          <div className="sv-foot">
            <span>© 2026 Sociva AI</span>
            <span><a href="#privacy">Privacy</a> · <a href="#terms">Terms</a></span>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="sv-right">
        <div className="sv-grid" />
        <span className="sv-pill"><Sparkle /> Autopilot 2.0</span>
        <h2 className="sv-hero">
          Better strategy.<br />More engagement.<br /><span className="grad">Real results.</span>
        </h2>
        <p className="sv-hero-sub">AI agents that research, create, publish and engage — while you focus on the business.</p>

        <div className="sv-cards">
          <div className="sv-glass sv-reach">
            <div className="lbl">Weekly reach</div>
            <div className="val">1.24M</div>
            <span className="sv-up">↑ 18.1%</span>
            <ReachChart />
          </div>

          <div className="sv-row">
            <div className="sv-reply">
              <div className="sv-bot"><Bot /></div>
              <div>
                <b>Replied to 38 comments</b>
                <span>in your brand voice · 2 min ago</span>
              </div>
            </div>
            <div className="sv-glass sv-leads">
              <div className="lbl">New leads today</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="val">+86</div>
                <div className="sv-avs">
                  <Avatar t="AL" bg="#8a5a2b" />
                  <Avatar t="MR" bg="#c07a6a" />
                  <Avatar t="KT" bg="#1f8fb3" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sv-trust">
          <div className="sv-avs">
            <Avatar t="JP" bg="#7a4a1f" />
            <Avatar t="LW" bg="#12a3c9" />
            <Avatar t="BO" bg="#8a5a2b" />
            <Avatar t="RS" bg="#4f8a5b" />
          </div>
          Trusted by 5,000+ brands and agencies
        </div>
      </div>
    </div>
  );
}
