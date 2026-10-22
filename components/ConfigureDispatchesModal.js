'use client';

import React, { useState, useEffect } from 'react';

export default function ConfigureDispatchesModal({ isOpen, onClose, onSaveSuccess, isViewer }) {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchConfigs();
    }
  }, [isOpen]);

  const fetchConfigs = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/dispatch-config');
      const data = await res.json();
      if (data.success && Array.isArray(data.configs)) {
        setConfigs(data.configs);
      } else {
        setErrorMsg(data.error || 'Failed to fetch depot dispatch configurations.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error loading configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleRatioChange = (depotIndex, field, value) => {
    if (isViewer) return;
    const num = Math.max(0, Math.min(100, parseFloat(value) || 0));
    setConfigs(prev => {
      const next = [...prev];
      next[depotIndex] = {
        ...next[depotIndex],
        [field]: num
      };
      return next;
    });
  };

  const handleSave = async () => {
    if (isViewer) return;
    setErrorMsg('');
    setSuccessMsg('');

    // Validate that every depot sums to 100%
    const invalidDepots = configs.filter(c => {
      const sum = (c.dispatch1 || 0) + (c.dispatch2 || 0) + (c.dispatch3 || 0) + (c.dispatch4 || 0);
      return Math.round(sum) !== 100;
    });

    if (invalidDepots.length > 0) {
      setErrorMsg(`All depots must have dispatch ratios summing to exactly 100%. Check: ${invalidDepots.map(d => d.depot).join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/dispatch-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Dispatch configurations saved successfully!');
        if (onSaveSuccess) onSaveSuccess(configs);
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setErrorMsg(data.error || 'Failed to save dispatch configurations.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error saving configurations.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '20px'
    }}>
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface, #1e1e2d)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '750px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main, #fff)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-icons-round" style={{ color: 'var(--color-primary, #8b5cf6)' }}>tune</span>
              Configure Depot Dispatch Ratios
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
              Configure the 4-dispatch dividing percentages for each depot (sum must equal 100%).
            </p>
          </div>
          <button 
            onClick={onClose}
            className="btn-close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div style={{
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#f87171',
              fontSize: '0.85rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span className="material-icons-round" style={{ fontSize: '1.2rem' }}>error_outline</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              padding: '12px 16px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              color: '#34d399',
              fontSize: '0.85rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span className="material-icons-round" style={{ fontSize: '1.2rem' }}>check_circle</span>
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <span className="material-icons-round animate-spin" style={{ fontSize: '2rem' }}>sync</span>
              <p style={{ marginTop: '8px' }}>Loading depot configurations...</p>
            </div>
          ) : configs.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No depots found. Ingest actual production records first.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))', color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Depot / Unit</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Dispatch 1 %</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Dispatch 2 %</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Dispatch 3 %</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Dispatch 4 %</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Total %</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c, idx) => {
                  const sum = Math.round((c.dispatch1 || 0) + (c.dispatch2 || 0) + (c.dispatch3 || 0) + (c.dispatch4 || 0));
                  const isValid = sum === 100;

                  return (
                    <tr key={c.depot} style={{ borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))' }}>
                      <td style={{ padding: '12px 8px', fontWeight: '600', color: 'var(--text-main, #fff)' }}>
                        {c.depot}
                      </td>
                      {['dispatch1', 'dispatch2', 'dispatch3', 'dispatch4'].map((field) => (
                        <td key={field} style={{ padding: '8px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={c[field] !== undefined ? c[field] : 25}
                            onChange={(e) => handleRatioChange(idx, field, e.target.value)}
                            disabled={isViewer}
                            style={{
                              width: '65px',
                              textAlign: 'center',
                              padding: '6px 4px',
                              borderRadius: '8px',
                              border: isValid 
                                ? '1px solid var(--border-color, rgba(255, 255, 255, 0.15))' 
                                : '1px solid #ef4444',
                              background: isValid 
                                ? 'rgba(255, 255, 255, 0.04)' 
                                : 'rgba(239, 68, 68, 0.08)',
                              color: 'var(--text-main, #fff)',
                              fontWeight: '600'
                            }}
                          />
                        </td>
                      ))}
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontWeight: '700',
                          fontSize: '0.8rem',
                          background: isValid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.2)',
                          color: isValid ? '#10b981' : '#ef4444'
                        }}>
                          {sum}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
              color: 'var(--text-main, #fff)',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Cancel
          </button>
          {!isViewer && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="btn btn-primary"
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                background: 'var(--color-primary, #8b5cf6)',
                border: 'none',
                color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {saving ? (
                <>
                  <span className="material-icons-round animate-spin" style={{ fontSize: '1rem' }}>sync</span>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span className="material-icons-round" style={{ fontSize: '1rem' }}>save</span>
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
