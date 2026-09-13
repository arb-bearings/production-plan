"use client";

import React, { useState, useEffect } from 'react';

const DEFAULT_ADMIN_EMAIL = 'arbbearings.marketing@gmail.com';

export default function UserManagementModal({ isOpen, onClose, currentUser }) {
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'create'
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Create user form state
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('Viewer');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset password modal state
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Delete user confirmation state
  const [deleteTargetUser, setDeleteTargetUser] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      } else {
        setErrorMsg(data.error || 'Failed to load user accounts.');
      }
    } catch (err) {
      console.error('Fetch users error:', err);
      setErrorMsg('Network error while loading user accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!newEmail.trim() || !newPassword) {
      setErrorMsg('Please enter an email and password for the new user.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          name: newName.trim(),
          password: newPassword,
          role: newRole
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to create user account.');
        setIsSubmitting(false);
        return;
      }

      setSuccessMsg(`User "${newEmail.trim().toLowerCase()}" created with ${newRole} access!`);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('Viewer');
      setIsSubmitting(false);

      // Refresh list & switch back to users tab
      fetchUsers();
      setTimeout(() => {
        setActiveTab('users');
      }, 1000);
    } catch (err) {
      console.error('Create user error:', err);
      setErrorMsg('Network error creating user.');
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (userId, updatedRole) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: updatedRole })
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: updatedRole } : u));
        setSuccessMsg(`Role updated to ${updatedRole}`);
        setTimeout(() => setSuccessMsg(''), 2500);
      } else {
        setErrorMsg(data.error || 'Failed to update role');
      }
    } catch (err) {
      setErrorMsg('Error updating role');
    }
  };

  const handleToggleActive = async (userId, currentStatus) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !currentStatus } : u));
        setSuccessMsg(`User status updated`);
        setTimeout(() => setSuccessMsg(''), 2500);
      } else {
        setErrorMsg(data.error || 'Failed to update status');
      }
    } catch (err) {
      setErrorMsg('Error updating status');
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetTargetUser || !resetPasswordVal) return;

    if (resetPasswordVal.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    try {
      setIsResetting(true);
      const res = await fetch(`/api/users/${resetTargetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetPassword: resetPasswordVal })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to reset password.');
        setIsResetting(false);
        return;
      }

      setSuccessMsg(`Password for ${resetTargetUser.email} has been updated successfully!`);
      setResetTargetUser(null);
      setResetPasswordVal('');
      setIsResetting(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Reset password error:', err);
      setErrorMsg('Network error resetting password.');
      setIsResetting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTargetUser) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/users/${deleteTargetUser.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to delete user.');
        setIsDeleting(false);
        return;
      }

      setUsers(prev => prev.filter(u => u.id !== deleteTargetUser.id));
      setSuccessMsg(`User ${deleteTargetUser.email} has been removed.`);
      setDeleteTargetUser(null);
      setIsDeleting(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Delete user error:', err);
      setErrorMsg('Network error deleting user.');
      setIsDeleting(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 12px var(--color-primary-glow)'
            }}>
              <span className="material-icons-round" style={{ fontSize: '1.4rem' }}>manage_accounts</span>
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>
                User & Password Management
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Create accounts, grant portal access, and manage user passwords
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            style={{ width: '34px', height: '34px' }}
          >
            <span className="material-icons-round" style={{ fontSize: '1.2rem' }}>close</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('users')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', padding: '6px 14px' }}
          >
            <span className="material-icons-round" style={{ fontSize: '1rem' }}>group</span>
            <span>Authorized Accounts</span>
            <span style={{
              background: activeTab === 'users' ? 'rgba(255,255,255,0.25)' : 'var(--color-primary-glow)',
              color: activeTab === 'users' ? '#fff' : 'var(--color-primary)',
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '0.75rem',
              fontWeight: '700'
            }}>
              {users.length}
            </span>
          </button>

          <button
            type="button"
            className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('create')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', padding: '6px 14px' }}
          >
            <span className="material-icons-round" style={{ fontSize: '1rem' }}>person_add</span>
            <span>+ Grant Access / Create Account</span>
          </button>
        </div>

        {/* Alert Feedback */}
        {errorMsg && (
          <div className="auth-alert auth-alert-danger" style={{ marginBottom: '12px' }}>
            <span className="material-icons-round" style={{ fontSize: '1.1rem', flexShrink: 0 }}>error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-alert auth-alert-success" style={{ marginBottom: '12px' }}>
            <span className="material-icons-round" style={{ fontSize: '1.1rem', flexShrink: 0 }}>check_circle</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          
          {/* TAB 1: USERS DIRECTORY */}
          {activeTab === 'users' && (
            <div>
              {isLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="auth-spinner" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent', width: '28px', height: '28px', margin: '0 auto 12px' }}></span>
                  <div>Loading user accounts...</div>
                </div>
              ) : users.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No accounts found. Create one using the "+ Grant Access" tab.
                </div>
              ) : (
                <div className="table-wrapper" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '10px 14px', fontWeight: '700' }}>User & Email</th>
                        <th style={{ padding: '10px 14px', fontWeight: '700' }}>Role</th>
                        <th style={{ padding: '10px 14px', fontWeight: '700' }}>Status</th>
                        <th style={{ padding: '10px 14px', fontWeight: '700', textAlign: 'right' }}>Actions & Password</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        const isPrimaryAdmin = u.email.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase();
                        const isSelf = currentUser && (u.id === currentUser.id || u.email === currentUser.email);

                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                            {/* User Info */}
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: u.role === 'Admin' 
                                    ? 'linear-gradient(135deg, #7c3aed, #9333ea)' 
                                    : u.role === 'Production Planner' 
                                      ? 'linear-gradient(135deg, #2563eb, #3b82f6)' 
                                      : 'linear-gradient(135deg, #059669, #10b981)',
                                  color: '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: '700',
                                  fontSize: '0.8rem',
                                  flexShrink: 0
                                }}>
                                  {u.name ? u.name.slice(0, 2).toUpperCase() : u.email.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontWeight: '600', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>{u.email}</span>
                                    {isSelf && (
                                      <span style={{ fontSize: '0.68rem', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>
                                        YOU
                                      </span>
                                    )}
                                    {isPrimaryAdmin && (
                                      <span style={{ fontSize: '0.68rem', background: 'rgba(124, 58, 237, 0.15)', color: '#7c3aed', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>
                                        PRIMARY
                                      </span>
                                    )}
                                  </div>
                                  {u.name && (
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                      {u.name}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Role */}
                            <td style={{ padding: '12px 14px' }}>
                              {isPrimaryAdmin ? (
                                <span className="user-role-badge badge-admin">Admin</span>
                              ) : (
                                <select
                                  value={u.role}
                                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-surface-opaque)',
                                    color: 'var(--text-main)',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <option value="Admin">Admin</option>
                                  <option value="Production Planner">Production Planner</option>
                                  <option value="Viewer">Viewer</option>
                                </select>
                              )}
                            </td>

                            {/* Status */}
                            <td style={{ padding: '12px 14px' }}>
                              {isPrimaryAdmin ? (
                                <span style={{ color: 'var(--color-success)', fontWeight: '600', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)' }}></span>
                                  Active
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(u.id, u.isActive)}
                                  title={u.isActive ? 'Click to Deactivate' : 'Click to Activate'}
                                  style={{
                                    background: u.isActive ? 'rgba(5, 150, 105, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                                    color: u.isActive ? 'var(--color-success)' : 'var(--color-danger)',
                                    border: `1px solid ${u.isActive ? 'rgba(5, 150, 105, 0.3)' : 'rgba(220, 38, 38, 0.3)'}`,
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }}></span>
                                  {u.isActive ? 'Active' : 'Disabled'}
                                </button>
                              )}
                            </td>

                            {/* Actions & Password Reset */}
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    setResetTargetUser(u);
                                    setResetPasswordVal('');
                                    setShowResetPassword(false);
                                  }}
                                  style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  title="Reset password for this user"
                                >
                                  <span className="material-icons-round" style={{ fontSize: '0.9rem', color: 'var(--color-primary)' }}>vpn_key</span>
                                  <span>Manage Password</span>
                                </button>

                                {!isPrimaryAdmin && !isSelf && (
                                  <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => setDeleteTargetUser(u)}
                                    style={{ fontSize: '0.78rem', padding: '4px 8px', display: 'flex', alignItems: 'center' }}
                                    title="Revoke access and delete account"
                                  >
                                    <span className="material-icons-round" style={{ fontSize: '0.95rem' }}>delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GRANT ACCESS / CREATE NEW USER */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(0,0,0,0.02)', padding: '18px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              
              <div style={{ marginBottom: '4px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: '0 0 4px', color: 'var(--text-main)' }}>
                  Create New Authorized Account
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  Enter credentials and assign a role to give someone access to the production planning portal.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="auth-form-group" style={{ marginBottom: 0 }}>
                  <label className="auth-label">Email Address *</label>
                  <div className="auth-input-wrapper">
                    <span className="material-icons-round auth-input-icon">email</span>
                    <input
                      type="email"
                      required
                      placeholder="user@arbbearings.com"
                      className="auth-input"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="auth-form-group" style={{ marginBottom: 0 }}>
                  <label className="auth-label">Full Name / Department (Optional)</label>
                  <div className="auth-input-wrapper">
                    <span className="material-icons-round auth-input-icon">badge</span>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma (Plant 1)"
                      className="auth-input"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              <div className="auth-form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="auth-label">Password * (min 6 characters)</label>
                  <button
                    type="button"
                    onClick={() => {
                      const pass = generateRandomPassword();
                      setNewPassword(pass);
                      setShowNewPassword(true);
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                  >
                    <span className="material-icons-round" style={{ fontSize: '0.9rem' }}>auto_fix_high</span>
                    Generate Random Password
                  </button>
                </div>
                <div className="auth-input-wrapper">
                  <span className="material-icons-round auth-input-icon">key</span>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter account password"
                    className="auth-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex="-1"
                  >
                    <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>
                      {showNewPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="auth-form-group" style={{ marginBottom: 0 }}>
                <label className="auth-label">Select Portal Access Role</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '4px' }}>
                  {[
                    { id: 'Admin', title: 'Admin', icon: 'admin_panel_settings', desc: 'Full control over planning, datasets, records, and user management.' },
                    { id: 'Production Planner', title: 'Planner', icon: 'date_range', desc: 'Can adjust planning parameters, edit plans, and export reports.' },
                    { id: 'Viewer', title: 'Viewer', icon: 'visibility', desc: 'Read-only view of dashboard metrics and reports.' }
                  ].map(r => (
                    <div
                      key={r.id}
                      onClick={() => setNewRole(r.id)}
                      style={{
                        border: `1.5px solid ${newRole === r.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                        background: newRole === r.id ? 'var(--color-primary-glow)' : 'var(--bg-surface-opaque)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', fontSize: '0.85rem', color: newRole === r.id ? 'var(--color-primary)' : 'var(--text-main)', marginBottom: '4px' }}>
                        <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>{r.icon}</span>
                        <span>{r.title}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                        {r.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 20px' }}
                >
                  <span className="material-icons-round" style={{ fontSize: '1rem' }}>
                    {isSubmitting ? 'hourglass_empty' : 'person_add'}
                  </span>
                  <span>{isSubmitting ? 'Creating Account...' : 'Create Account & Grant Access'}</span>
                </button>
              </div>
            </form>
          )}

        </div>

        {/* SUB-MODAL: RESET USER PASSWORD */}
        {resetTargetUser && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '12px',
            zIndex: 100,
            backdropFilter: 'blur(3px)'
          }}>
            <div style={{
              background: 'var(--bg-surface-opaque)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '420px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-icons-round" style={{ color: 'var(--color-primary)' }}>vpn_key</span>
                  Set User Password
                </h3>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setResetTargetUser(null)}
                  style={{ width: '28px', height: '28px' }}
                >
                  <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>close</span>
                </button>
              </div>

              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                Setting new password for: <strong>{resetTargetUser.email}</strong>
              </p>

              <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="auth-form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="auth-label">New Password (min 6 chars)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const pass = generateRandomPassword();
                        setResetPasswordVal(pass);
                        setShowResetPassword(true);
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Generate
                    </button>
                  </div>
                  <div className="auth-input-wrapper">
                    <span className="material-icons-round auth-input-icon">key</span>
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      required
                      autoFocus
                      placeholder="Enter new password"
                      className="auth-input"
                      value={resetPasswordVal}
                      onChange={(e) => setResetPasswordVal(e.target.value)}
                      disabled={isResetting}
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowResetPassword(!showResetPassword)}
                      tabIndex="-1"
                    >
                      <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>
                        {showResetPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setResetTargetUser(null)}
                    disabled={isResetting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isResetting}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span className="material-icons-round" style={{ fontSize: '1rem' }}>save</span>
                    {isResetting ? 'Saving...' : 'Save Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SUB-MODAL: DELETE USER CONFIRMATION */}
        {deleteTargetUser && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '12px',
            zIndex: 100,
            backdropFilter: 'blur(3px)'
          }}>
            <div style={{
              background: 'var(--bg-surface-opaque)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '420px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-danger)', marginBottom: '12px' }}>
                <span className="material-icons-round" style={{ fontSize: '1.6rem' }}>warning</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0 }}>Revoke User Access</h3>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                Are you sure you want to permanently delete the account for:
              </p>
              <div style={{ padding: '8px 12px', background: 'rgba(220, 38, 38, 0.08)', borderRadius: '6px', fontWeight: '700', fontSize: '0.9rem', color: 'var(--color-danger)', marginBottom: '16px' }}>
                {deleteTargetUser.email}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                This user will immediately lose all access to the production planning portal.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeleteTargetUser(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDeleteUser}
                  disabled={isDeleting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <span className="material-icons-round" style={{ fontSize: '1rem' }}>delete_forever</span>
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
