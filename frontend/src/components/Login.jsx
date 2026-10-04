import React, { useState } from "react";
import { signInUser, isMockAuth } from "../config/auth";

export default function Login({ onAuthSuccess, onSwitchToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInUser(email, password);
      onAuthSuccess();
    } catch (err) {
      console.error("Login failed:", err);
      setError(err.message || "Failed to log in. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-badge">PP</div>
          <h2>Welcome back to PaperPulse</h2>
          <p className="auth-subtitle">Log in to query your knowledge base</p>
        </div>

        {isMockAuth && (
          <div className="alert alert-info">
            💡 <strong>Demo Mode Active:</strong> You can enter any email and a password of at least 6 characters to log in instantly.
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Authenticating..." : "Log In"}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account?{" "}
          <button type="button" className="btn-link" onClick={onSwitchToRegister}>
            Sign up free
          </button>
        </div>
      </div>
    </div>
  );
}
