"use client";

import React, { useState } from 'react';

export default function LoginPage({ onLoginSuccess, theme, setTheme }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Authentication failed. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      // Success
      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorMessage('Network connection error. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      {/* Background ambient lighting effects */}
      <div className="auth-ambient-glow auth-ambient-glow-1"></div>
      <div className="auth-ambient-glow auth-ambient-glow-2"></div>

      {/* Header theme toggle */}
      <div className="auth-theme-toggle">
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="btn-icon"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          <span className="material-icons-round">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
        </button>
      </div>

      <div className="auth-card">
        {/* ARB Logo Header */}
        <div className="auth-header">
          <div className="auth-logo-badge">
            <span className="auth-logo-text">ARB</span>
          </div>
          <h1 className="auth-title">ARB BEARINGS</h1>
          <p className="auth-subtitle">AI-Driven Production Planning & Analytics Portal</p>
          <div className="auth-secure-badge">
            <span className="material-icons-round" style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>
              lock
            </span>
            <span>Authorized Personnel Access Only</span>
          </div>
        </div>

        {/* Error Alert Box */}
        {errorMessage && (
          <div className="auth-alert auth-alert-danger">
            <span className="material-icons-round" style={{ fontSize: '1.2rem', flexShrink: 0 }}>
              error_outline
            </span>
            <div className="auth-alert-text">{errorMessage}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-form-group">
            <label className="auth-label" htmlFor="auth-email">
              Work Email Address
            </label>
            <div className="auth-input-wrapper">
              <span className="material-icons-round auth-input-icon">email</span>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className="auth-input"
                placeholder="name@arbbearings.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="auth-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="auth-label" htmlFor="auth-password">
                Password
              </label>
            </div>
            <div className="auth-input-wrapper">
              <span className="material-icons-round auth-input-icon">key</span>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className="auth-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-icons-round" style={{ fontSize: '1.2rem' }}>
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="auth-spinner"></span>
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>
                  arrow_forward
                </span>
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="auth-footer">
          <span>ARB Bearings Ltd. &bull; Enterprise Planning System</span>
        </div>
      </div>
    </div>
  );
}
