"use client";

import React, { useState, useEffect, useRef } from 'react';

export default function HeaderUserMenu({
  currentUser,
  onOpenUserMgmt,
  onOpenChangePassword,
  onLogout,
  theme,
  setTheme
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const isAdmin = currentUser?.role === 'Admin';
  const role = currentUser?.role || 'Viewer';

  useEffect(() => {
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const getInitials = (user) => {
    if (!user) return 'AB';
    if (user.name) {
      const parts = user.name.trim().split(' ');
      if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
      return user.name.slice(0, 2).toUpperCase();
    }
    return user.email ? user.email.slice(0, 2).toUpperCase() : 'AB';
  };

  const getRoleBadgeClass = (r) => {
    if (r === 'Admin') return 'badge-admin';
    if (r === 'Production Planner') return 'badge-planner';
    return 'badge-viewer';
  };

  return (
    <div className="header-user-nav" ref={menuRef} style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
      
      {/* Quick Admin Passwords Management Button */}
      {isAdmin && (
        <button
          type="button"
          onClick={onOpenUserMgmt}
          className="btn btn-secondary quick-manage-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.82rem',
            padding: '6px 12px',
            background: 'var(--color-primary-glow)',
            borderColor: 'rgba(124, 58, 237, 0.4)',
            color: 'var(--color-primary)',
            fontWeight: '600'
          }}
          title="Open User & Password Management"
        >
          <span className="material-icons-round" style={{ fontSize: '1.05rem' }}>vpn_key</span>
          <span>Manage Passwords</span>
        </button>
      )}

      {/* Direct Logout Button */}
      <button
        type="button"
        onClick={onLogout}
        className="btn btn-secondary quick-logout-btn"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '0.82rem',
          padding: '6px 12px',
          background: 'rgba(220, 38, 38, 0.08)',
          borderColor: 'rgba(220, 38, 38, 0.25)',
          color: 'var(--color-danger)',
          fontWeight: '600',
          cursor: 'pointer'
        }}
        title="Sign out of your account"
      >
        <span className="material-icons-round" style={{ fontSize: '1.05rem' }}>logout</span>
        <span>Logout</span>
      </button>

      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="btn-icon"
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        <span className="material-icons-round">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
      </button>

      {/* User Profile Pill Button */}
      <button
        type="button"
        className="user-profile-pill"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(0, 0, 0, 0.03)',
          border: '1px solid var(--border-color)',
          padding: '4px 10px 4px 6px',
          borderRadius: '30px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          color: 'var(--text-main)'
        }}
      >
        {/* Avatar circle */}
        <div style={{
          width: '30px',
          height: '30px',
          borderRadius: '50%',
          background: isAdmin 
            ? 'linear-gradient(135deg, #7c3aed, #9333ea)' 
            : role === 'Production Planner' 
              ? 'linear-gradient(135deg, #2563eb, #3b82f6)' 
              : 'linear-gradient(135deg, #059669, #10b981)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '700',
          fontSize: '0.75rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
        }}>
          {getInitials(currentUser)}
        </div>

        {/* Name / Email label */}
        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: '700', lineHeight: 1.2, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentUser?.name || currentUser?.email?.split('@')[0] || 'User'}
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1 }}>
            {role}
          </span>
        </div>

        <span className="material-icons-round" style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '2px' }}>
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="user-dropdown-card" style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: '260px',
          background: 'var(--bg-surface-opaque)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
          padding: '8px',
          zIndex: 1050,
          animation: 'fadeIn 0.15s ease-out'
        }}>
          {/* Header info */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)', marginBottom: '6px' }}>
            <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser?.email}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <span className={`user-role-badge ${getRoleBadgeClass(role)}`} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px' }}>
                {role}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-success)', fontWeight: '600' }}>
                ● Active
              </span>
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {isAdmin && (
              <button
                type="button"
                className="user-dropdown-item"
                onClick={() => {
                  setIsOpen(false);
                  onOpenUserMgmt();
                }}
              >
                <span className="material-icons-round" style={{ color: 'var(--color-primary)' }}>manage_accounts</span>
                <span>Manage Users & Passwords</span>
              </button>
            )}

            <button
              type="button"
              className="user-dropdown-item"
              onClick={() => {
                setIsOpen(false);
                onOpenChangePassword();
              }}
            >
              <span className="material-icons-round" style={{ color: 'var(--color-secondary)' }}>vpn_key</span>
              <span>Change My Password</span>
            </button>

            <button
              type="button"
              className="user-dropdown-item"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <span className="material-icons-round">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
              <span>{theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}</span>
            </button>

            <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }}></div>

            <button
              type="button"
              className="user-dropdown-item user-dropdown-danger"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
            >
              <span className="material-icons-round">logout</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
