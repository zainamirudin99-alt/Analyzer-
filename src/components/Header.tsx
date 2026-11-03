'use client';
/* eslint-disable @next/next/no-img-element */

import React from 'react';
import { Menu, LogOut, User } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { AccountUser } from '@/lib/account-sync';

interface HeaderProps {
  supabaseStatus: {
    configured: boolean;
    connected: boolean;
  };
  activeTab: string;
  onTabChange: (tab: string) => void;
  isDrawerOpen?: boolean;
  onToggleDrawer?: () => void;
  toggleButtonRef?: React.RefObject<HTMLButtonElement>;
  currentUser?: AccountUser | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  supabaseStatus,
  onTabChange,
  isDrawerOpen = false,
  onToggleDrawer,
  toggleButtonRef,
  currentUser,
  onLogout
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  return (
    <header className="app-header">
      <div className="header-left-cluster">
        <button
          ref={toggleButtonRef}
          type="button"
          id="nav-toggle-btn"
          className="nav-hamburger-btn"
          onClick={onToggleDrawer}
          aria-expanded={isDrawerOpen}
          aria-controls="app-navigation-drawer"
          aria-label={isEn ? 'Toggle Navigation Menu' : 'Toggle Menu Navigasi'}
          data-testid="nav-toggle-btn"
        >
          <Menu size={22} />
        </button>

        <div className="header-brand" style={{ cursor: 'pointer' }} onClick={() => onTabChange('upload')}>
          <div className="header-logo-badge">
            <img src="/logo.png?v=2" alt="ANALYZER(?) Logo" className="header-logo-img" />
          </div>
          <div className="header-title-box">
            <h1>ANALYZER(?)</h1>
            <p>
              {isEn
                ? 'AI Document Analysis, Statistical Regression & Supabase Database'
                : 'Analisis Dokumen AI, Regresi Statistik & Database Supabase'}
            </p>
          </div>
        </div>
      </div>

      <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div
          className="db-pill"
          style={{ cursor: 'pointer' }}
          onClick={() => onTabChange('settings')}
          title={isEn ? 'Click to open settings & database' : 'Klik untuk membuka pengaturan database'}
        >
          <span className={`db-dot ${supabaseStatus.connected ? '' : 'inactive'}`} />
          <span>{supabaseStatus.connected ? 'Supabase Connected' : 'Supabase Setup'}</span>
        </div>

        {currentUser && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.14)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '999px',
              padding: '5px 6px 5px 12px',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 700
            }}
          >
            <User size={14} />
            <span>{currentUser.username}</span>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title={isEn ? 'Sign Out' : 'Keluar Akun'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(0, 0, 0, 0.28)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '999px',
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <LogOut size={12} />
                <span>{isEn ? 'Logout' : 'Keluar'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
