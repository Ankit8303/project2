import React, { useState } from "react";
import { registerUser, isMockAuth } from "../config/auth";

export default function Register({ onAuthSuccess, onSwitchToLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    if (password.length < 6) {
      return setError("Password must be at least 6 characters.");
    }

    setLoading(true);

    try {
      await registerUser(email, password);
      onAuthSuccess();
    } catch (err) {
      console.error("Registration failed:", err);
      setError(err.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-badge">PP</div>
          <h2>Create your Account</h2>
          <p className="auth-subtitle">Get started with PaperPulse document search</p>
        </div>

        {isMockAuth && (
          <div className="alert alert-info">
            💡 <strong>Demo Mode Active:</strong> Any new registration will proceed locally and log you in immediately.
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
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{" "}
          <button type="button" className="btn-link" onClick={onSwitchToLogin}>
            Log in instead
          </button>
        </div>
      </div>
    </div>
  );
}
