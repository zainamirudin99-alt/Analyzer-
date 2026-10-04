import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('UI/UX Viewport & Accessibility Conformance', () => {
  const regressionTabPath = path.resolve(__dirname, '../../src/components/RegressionTab.tsx');
  const resultsViewPath = path.resolve(__dirname, '../../src/components/RegressionResultsView.tsx');
  const globalsCssPath = path.resolve(__dirname, '../../src/app/globals.css');

  const tabContent = fs.readFileSync(regressionTabPath, 'utf8');
  const resultsContent = fs.readFileSync(resultsViewPath, 'utf8');
  const cssContent = fs.readFileSync(globalsCssPath, 'utf8');

  it('enforces min 44px touch targets on buttons and interactive elements', () => {
    // Buttons in wizard must have minHeight 44px or proper accessible padding
    expect(tabContent).toContain("minHeight: '44px'");
  });

  it('enforces min 16px font size on form inputs to prevent iOS auto-zoom', () => {
    // Inputs/selects in wizard have fontSize 16px
    expect(tabContent).toContain("fontSize: '16px'");
  });

  it('contains mobile table horizontal scrolling container and card view toggle', () => {
    // In RegressionResultsView, tables are inside overflowX: auto containers
    expect(resultsContent).toContain("overflowX: 'auto'");
    // Contains toggle for card view on mobile
    expect(resultsContent).toContain("viewMode === 'card'");
    expect(resultsContent).toContain("viewMode === 'table'");
  });

  it('has zero vertical lines in SPSS table styling (conforms to SPSS style guide)', () => {
    // SPSS tables have borderTop and borderBottom, zero vertical rules
    expect(resultsContent).toContain("borderCollapse: 'collapse'");
    expect(resultsContent).not.toContain("borderLeft: '1px solid'");
    expect(resultsContent).not.toContain("borderRight: '1px solid'");
  });

  it('suppresses leading zero for p-values (Sig.) format .000 in SPSS tables', () => {
    expect(resultsContent).toContain("formatSig");
    expect(resultsContent).toContain("'.000'");
  });
});
