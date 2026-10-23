'use client';

import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';

export interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  toggleButtonRef?: React.RefObject<HTMLButtonElement>;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  toggleButtonRef
}) => {
  // Grup Analyze SR otomatis terbuka jika salah satu anaknya aktif
  const isChildOfAnalyze = ['upload', 'results', 'guide'].includes(activeTab);
  const [isAnalyzeOpen, setIsAnalyzeOpen] = useState<boolean>(true);

  useEffect(() => {
    if (isChildOfAnalyze) {
      setIsAnalyzeOpen(true);
    }
  }, [activeTab, isChildOfAnalyze]);

  // Keyboard navigation & trap: Esc untuk menutup dan fokus kembali ke tombol toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
        if (toggleButtonRef?.current) {
          toggleButtonRef.current.focus();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, toggleButtonRef]);

  const handleItemClick = (tab: string) => {
    onSelectTab(tab);
    onClose();
    if (toggleButtonRef?.current) {
      toggleButtonRef.current.focus();
    }
  };

  return (
    <>
      {/* Backdrop Overlay */}
      <div
        className={`drawer-backdrop ${isOpen ? 'active' : ''}`}
        onClick={() => {
          onClose();
          if (toggleButtonRef?.current) {
            toggleButtonRef.current.focus();
          }
        }}
        aria-hidden="true"
        data-testid="drawer-backdrop"
      />

      {/* Side Drawer Panel */}
      <aside
        id="app-navigation-drawer"
        className={`navigation-drawer ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-label="Navigasi Utama"
        aria-modal="true"
        data-testid="navigation-drawer"
      >
        <div className="drawer-header">
          <div className="drawer-brand">
            <span className="drawer-logo-badge">🌿</span>
            <div className="drawer-title-group">
              <span className="drawer-app-title">Analyzer Navigasi</span>
              <span className="drawer-app-subtitle">CED & Analisis Statistik</span>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={() => {
              onClose();
              if (toggleButtonRef?.current) {
                toggleButtonRef.current.focus();
              }
            }}
            aria-label="Tutup Navigasi"
            data-testid="drawer-close-btn"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="drawer-nav-list" aria-label="Daftar Menu">
          {/* 1. Pengaturan & Database */}
          <button
            type="button"
            className={`drawer-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => handleItemClick('settings')}
            data-testid="nav-item-settings"
          >
            <span className="nav-item-icon">⚙️</span>
            <span className="nav-item-label">Pengaturan & Database</span>
          </button>

          {/* 2. Analyze SR (Grup yang bisa dilipat) */}
          <div className="drawer-group" data-testid="drawer-group-analyze-sr">
            <button
              type="button"
              className={`drawer-group-header ${isChildOfAnalyze ? 'has-active-child' : ''}`}
              onClick={() => setIsAnalyzeOpen(prev => !prev)}
              aria-expanded={isAnalyzeOpen}
              aria-controls="analyze-sr-subitems"
              data-testid="group-header-analyze-sr"
            >
              <div className="group-header-left">
                <span className="nav-item-icon">📑</span>
                <span className="group-title">Analyze SR</span>
              </div>
              <span className="group-chevron">
                {isAnalyzeOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>

            {isAnalyzeOpen && (
              <div id="analyze-sr-subitems" className="drawer-subgroup" data-testid="analyze-sr-subitems">
                <button
                  type="button"
                  className={`drawer-sub-item ${activeTab === 'upload' ? 'active' : ''}`}
                  onClick={() => handleItemClick('upload')}
                  data-testid="nav-item-upload"
                >
                  <span className="nav-item-icon">🌿</span>
                  <span className="nav-item-label">Upload & Analisis</span>
                </button>

                <button
                  type="button"
                  className={`drawer-sub-item ${activeTab === 'results' ? 'active' : ''}`}
                  onClick={() => handleItemClick('results')}
                  data-testid="nav-item-results"
                >
                  <span className="nav-item-icon">📋</span>
                  <span className="nav-item-label">Tabel Hasil Analisis</span>
                </button>

                <button
                  type="button"
                  className={`drawer-sub-item ${activeTab === 'guide' ? 'active' : ''}`}
                  onClick={() => handleItemClick('guide')}
                  data-testid="nav-item-guide"
                >
                  <span className="nav-item-icon">🌱</span>
                  <span className="nav-item-label">Panduan 18 Indikator</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. Analisis Regresi Statistik */}
          <button
            type="button"
            className={`drawer-nav-item ${activeTab === 'regression' ? 'active' : ''}`}
            onClick={() => handleItemClick('regression')}
            data-testid="nav-item-regression"
          >
            <span className="nav-item-icon">📊</span>
            <span className="nav-item-label">Analisis Regresi Statistik</span>
          </button>

          {/* 4. Regresi Data Panel Stata (BARU) */}
          <button
            type="button"
            className={`drawer-nav-item ${activeTab === 'panel' ? 'active' : ''}`}
            onClick={() => handleItemClick('panel')}
            data-testid="nav-item-panel"
          >
            <span className="nav-item-icon">📈</span>
            <div className="nav-item-panel-label-group">
              <span className="nav-item-label">Regresi Data Panel Stata</span>
              <span className="nav-item-badge">BARU</span>
            </div>
          </button>
        </nav>

        <div className="drawer-footer">
          <div className="drawer-footer-text">
            <span>Analyzer v1.0 • Standar Ekonometrika</span>
          </div>
        </div>
      </aside>
    </>
  );
};
