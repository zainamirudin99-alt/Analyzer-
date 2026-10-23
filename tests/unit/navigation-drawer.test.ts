import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Navigation Drawer Architecture Conformance (P0 Navigation)', () => {
  const drawerPath = path.resolve(__dirname, '../../src/components/NavigationDrawer.tsx');
  const headerPath = path.resolve(__dirname, '../../src/components/Header.tsx');
  const pagePath = path.resolve(__dirname, '../../src/app/page.tsx');
  const cssPath = path.resolve(__dirname, '../../src/app/globals.css');
  const shellPath = path.resolve(__dirname, '../../src/components/PanelTabShell.tsx');

  it('verifies NavigationDrawer.tsx exists and contains the required 4-part structure', () => {
    expect(fs.existsSync(drawerPath)).toBe(true);
    const content = fs.readFileSync(drawerPath, 'utf8');

    // 1. Pengaturan & Database
    expect(content).toContain('nav-item-settings');
    expect(content).toContain('Pengaturan & Database');

    // 2. Analyze SR Group (collapsible)
    expect(content).toContain('drawer-group');
    expect(content).toContain('Analyze SR');
    expect(content).toContain('nav-item-upload');
    expect(content).toContain('Upload & Analisis');
    expect(content).toContain('nav-item-results');
    expect(content).toContain('Tabel Hasil Analisis');
    expect(content).toContain('nav-item-guide');
    expect(content).toContain('Panduan 18 Indikator');

    // 3. Analisis Regresi Statistik
    expect(content).toContain('nav-item-regression');
    expect(content).toContain('Analisis Regresi Statistik');

    // 4. Regresi Data Panel Stata (BARU)
    expect(content).toContain('nav-item-panel');
    expect(content).toContain('Regresi Data Panel Stata');
    expect(content).toContain('BARU');
  });

  it('implements auto-expand for Analyze SR when any of its child tabs is active', () => {
    const content = fs.readFileSync(drawerPath, 'utf8');
    expect(content).toContain("['upload', 'results', 'guide'].includes(activeTab)");
    expect(content).toContain('setIsAnalyzeOpen(true)');
  });

  it('implements accessibility and keyboard focus management (Esc, backdrop, toggle focus)', () => {
    const content = fs.readFileSync(drawerPath, 'utf8');

    // ARIA attributes
    expect(content).toContain('id="app-navigation-drawer"');
    expect(content).toContain('role="dialog"');
    expect(content).toContain('aria-label="Navigasi Utama"');
    expect(content).toContain('aria-modal="true"');
    expect(content).toContain('aria-hidden="true"'); // backdrop

    // Esc handler and focus restoration
    expect(content).toContain("e.key === 'Escape'");
    expect(content).toContain('toggleButtonRef.current.focus()');
  });

  it('verifies Header.tsx has toggle button with aria-expanded and aria-controls', () => {
    expect(fs.existsSync(headerPath)).toBe(true);
    const content = fs.readFileSync(headerPath, 'utf8');

    expect(content).toContain('id="nav-toggle-btn"');
    expect(content).toContain('aria-expanded={isDrawerOpen}');
    expect(content).toContain('aria-controls="app-navigation-drawer"');
    expect(content).toContain('aria-label="Toggle Menu Navigasi"');
    expect(content).toContain('onToggleDrawer');

    // Verifies existing horizontal tabs are preserved during transition
    expect(content).toContain('className="nav-tabs"');
  });

  it('verifies page.tsx integrates NavigationDrawer, drawer state, and PanelTabShell', () => {
    expect(fs.existsSync(pagePath)).toBe(true);
    const content = fs.readFileSync(pagePath, 'utf8');

    expect(content).toContain('isDrawerOpen');
    expect(content).toContain('setIsDrawerOpen');
    expect(content).toContain('<NavigationDrawer');
    expect(content.includes('<PanelTab') || content.includes('<PanelTabShell')).toBe(true);
  });

  it('verifies PanelTabShell.tsx exists as empty shell ready for P1', () => {
    expect(fs.existsSync(shellPath)).toBe(true);
    const content = fs.readFileSync(shellPath, 'utf8');

    expect(content).toContain('Regresi Data Panel Stata');
    expect(content).toContain('Fase P0 — Cangkang Siap');
    expect(content).toContain('P1 — Impor & Pemetaan');
  });

  it('verifies globals.css includes slide transition, backdrop blur, and active styles', () => {
    expect(fs.existsSync(cssPath)).toBe(true);
    const content = fs.readFileSync(cssPath, 'utf8');

    expect(content).toContain('.nav-hamburger-btn');
    expect(content).toContain('.drawer-backdrop');
    expect(content).toContain('backdrop-filter: blur');
    expect(content).toContain('.navigation-drawer');
    expect(content).toContain('transform: translateX(-100%)');
    expect(content).toContain('transform: translateX(0)');
    expect(content).toContain('.drawer-nav-item.active');
  });
});
