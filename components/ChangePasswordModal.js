"use client";

import React, { useState } from 'react';

export default function ChangePasswordModal({ isOpen, onClose, currentUser }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!currentPassword) {
      setErrorMsg('Please enter your current password.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match. Please verify.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to update password.');
        setIsLoading(false);
        return;
      }

      setSuccessMsg('Your password has been changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsLoading(false);

      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Password change error:', err);
      setErrorMsg('Network error while updating password.');
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: '460px', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'var(--color-primary-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary)'
            }}>
              <span className="material-icons-round">vpn_key</span>
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0, color: 'var(--text-main)' }}>Change Password</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {currentUser?.email}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            style={{ width: '32px', height: '32px' }}
          >
            <span className="material-icons-round" style={{ fontSize: '1.2rem' }}>close</span>
          </button>
        </div>

        {/* Alert Messages */}
        {errorMsg && (
          <div className="auth-alert auth-alert-danger" style={{ marginBottom: '14px' }}>
            <span className="material-icons-round" style={{ fontSize: '1.1rem', flexShrink: 0 }}>error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-alert auth-alert-success" style={{ marginBottom: '14px' }}>
            <span className="material-icons-round" style={{ fontSize: '1.1rem', flexShrink: 0 }}>check_circle</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="auth-form-group" style={{ marginBottom: 0 }}>
            <label className="auth-label">Current Password</label>
            <div className="auth-input-wrapper">
              <span className="material-icons-round auth-input-icon">lock</span>
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                placeholder="Enter current password"
                className="auth-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex="-1"
              >
                <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>
                  {showCurrent ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <div className="auth-form-group" style={{ marginBottom: 0 }}>
            <label className="auth-label">New Password (min 6 characters)</label>
            <div className="auth-input-wrapper">
              <span className="material-icons-round auth-input-icon">key</span>
              <input
                type={showNew ? 'text' : 'password'}
                required
                placeholder="Enter new strong password"
                className="auth-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowNew(!showNew)}
                tabIndex="-1"
              >
                <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>
                  {showNew ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <div className="auth-form-group" style={{ marginBottom: 0 }}>
            <label className="auth-label">Confirm New Password</label>
            <div className="auth-input-wrapper">
              <span className="material-icons-round auth-input-icon">check_circle_outline</span>
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                placeholder="Re-type new password"
                className="auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex="-1"
              >
                <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>
                  {showConfirm ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: '10px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span className="material-icons-round" style={{ fontSize: '1rem' }}>
                {isLoading ? 'hourglass_empty' : 'save'}
              </span>
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
