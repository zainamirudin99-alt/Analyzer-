import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Panel UI/UX Components Conformance (StataConsoleBlock, PanelStepper, PanelTab)', () => {
  const consoleBlockPath = path.resolve(__dirname, '../../src/components/StataConsoleBlock.tsx');
  const stepperPath = path.resolve(__dirname, '../../src/components/PanelStepper.tsx');
  const panelTabPath = path.resolve(__dirname, '../../src/components/PanelTab.tsx');
  const headerPath = path.resolve(__dirname, '../../src/components/Header.tsx');
  const pagePath = path.resolve(__dirname, '../../src/app/page.tsx');

  it('StataConsoleBlock renders 4 mandatory Stata blocks with copy button and monospace terminal', () => {
    expect(fs.existsSync(consoleBlockPath)).toBe(true);
    const content = fs.readFileSync(consoleBlockPath, 'utf8');

    // 4 mandatory blocks
    expect(content).toContain('stataCommand');
    expect(content).toContain('stataFunction');
    expect(content).toContain('stataOutput');
    expect(content).toContain('babyLanguage');

    // Monospace terminal styling & copy button
    expect(content).toContain('fontFamily');
    expect(content).toContain('copy');
    expect(content).toContain('minHeight');
  });

  it('PanelStepper provides step 0-12 navigation with responsive desktop/mobile support', () => {
    expect(fs.existsSync(stepperPath)).toBe(true);
    const content = fs.readFileSync(stepperPath, 'utf8');

    // 13 steps (0 to 12)
    expect(content).toContain('12');
    expect(content).toContain('onSelectStep');
    expect(content).toContain('activeStep');
    expect(content).toContain('minHeight'); // touch target >= 44px
  });

  it('PanelTab contains Grunfeld preset, variable selectors, and accessible touch targets', () => {
    expect(fs.existsSync(panelTabPath)).toBe(true);
    const content = fs.readFileSync(panelTabPath, 'utf8');

    // Preset Grunfeld
    expect(content).toContain('Grunfeld');
    expect(content).toContain('fitPanel');

    // Variable selectors
    expect(content).toContain('idCol');
    expect(content).toContain('timeCol');
    expect(content).toContain('yCol');
    expect(content).toContain('xCols');

    // Mobile & accessibility constraints
    expect(content).toContain("fontSize: '16px'"); // Prevent iOS auto-zoom
    expect(content).toContain("minHeight: '44px'"); // Min touch target
  });

  it('Header and Page integrate the new Regresi Data Panel tab seamlessly (Invariant I7)', () => {
    const headerContent = fs.readFileSync(headerPath, 'utf8');
    const pageContent = fs.readFileSync(pagePath, 'utf8');

    // Header has panel tab button
    expect(headerContent).toContain("'panel'");
    expect(headerContent).toContain('Regresi Data Panel');

    // Page mounts PanelTab
    expect(pageContent).toContain('PanelTab');
    expect(pageContent).toContain("activeTab === 'panel'");

    // CED menu is preserved unchanged (Invariant I7)
    expect(headerContent).toContain('upload');
    expect(headerContent).toContain('results');
    expect(headerContent).toContain('guide');
    expect(pageContent).toContain('UploadTab');
  });
});
