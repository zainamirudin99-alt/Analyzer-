'use client';
/* eslint-disable @next/next/no-img-element */

import React from 'react';
import { Menu } from 'lucide-react';

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
}

export const Header: React.FC<HeaderProps> = ({
  supabaseStatus,
  activeTab,
  onTabChange,
  isDrawerOpen = false,
  onToggleDrawer,
  toggleButtonRef
}) => {
  return (
    <>
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
            aria-label="Toggle Menu Navigasi"
            data-testid="nav-toggle-btn"
          >
            <Menu size={22} />
          </button>

          <div className="header-brand" style={{ cursor: 'pointer' }} onClick={() => onTabChange('upload')}>
            <div className="header-logo-badge">
              <img src="/logo.png" alt="PDF Analyzer Logo" className="header-logo-img" />
            </div>
            <div className="header-title-box">
              <h1>PDF Analyzer</h1>
              <p>Carbon Emission Disclosure (CED) — Analisis AI & Database Supabase</p>
            </div>
          </div>
        </div>

        <div className="header-actions">
          <div
            className="db-pill"
            style={{ cursor: 'pointer' }}
            onClick={() => onTabChange('settings')}
            title="Klik untuk membuka pengaturan database"
          >
            <span className={`db-dot ${supabaseStatus.connected ? '' : 'inactive'}`} />
            <span>{supabaseStatus.connected ? 'Supabase Connected' : 'Supabase Setup'}</span>
          </div>
        </div>
      </header>

      <nav className="nav-tabs">
        <button
          className={`nav-tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => onTabChange('upload')}
        >
          <span>🌿</span> Upload & Analisis
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => onTabChange('results')}
        >
          <span>📋</span> Tabel Hasil Analisis
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
          onClick={() => onTabChange('guide')}
        >
          <span>🌱</span> Panduan 18 Indikator
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          <span>⚙️</span> Pengaturan & Database
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'regression' ? 'active' : ''}`}
          onClick={() => onTabChange('regression')}
          style={{ background: activeTab === 'regression' ? 'var(--fern)' : 'transparent', color: activeTab === 'regression' ? '#ffffff' : 'inherit' }}
        >
          <span>📊</span> Analisis Regresi Statistik
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'panel' ? 'active' : ''}`}
          onClick={() => onTabChange('panel')}
          style={{ background: activeTab === 'panel' ? 'var(--fern)' : 'transparent', color: activeTab === 'panel' ? '#ffffff' : 'inherit' }}
        >
          <span>📈</span> Regresi Data Panel
        </button>
      </nav>
    </>
  );
};
