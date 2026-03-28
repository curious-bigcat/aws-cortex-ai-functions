import React, { useState } from "react";
import { signIn, signUp, confirmSignUp } from "../services/auth";

export default function Login({ onSignIn }) {
  const [mode, setMode] = useState("signin"); // signin | signup | confirm
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn({ username: email, password });
      onSignIn();
    } catch (err) {
      setError(err.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp({ username: email, password, options: { userAttributes: { email } } });
      setMode("confirm");
    } catch (err) {
      setError(err.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      await signIn({ username: email, password });
      onSignIn();
    } catch (err) {
      setError(err.message || "Confirmation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Healthcare AI Assistant</h1>
        <p className="login-subtitle">Powered by Snowflake Cortex & AWS</p>

        {error && <div className="error-banner">{error}</div>}

        {mode === "signin" && (
          <form onSubmit={handleSignIn}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <p className="toggle-link">
              No account? <button type="button" onClick={() => setMode("signup")}>Sign up</button>
            </p>
          </form>
        )}

        {mode === "signup" && (
          <form onSubmit={handleSignUp}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password (8+ chars)" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Creating..." : "Create Account"}
            </button>
            <p className="toggle-link">
              Have an account? <button type="button" onClick={() => setMode("signin")}>Sign in</button>
            </p>
          </form>
        )}

        {mode === "confirm" && (
          <form onSubmit={handleConfirm}>
            <p>Check your email for a verification code.</p>
            <input type="text" placeholder="Verification code" value={code} onChange={e => setCode(e.target.value)} required />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Verifying..." : "Verify & Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
