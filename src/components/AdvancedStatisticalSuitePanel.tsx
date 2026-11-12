'use client';

import React, { useState, useMemo } from 'react';
import { OLSFitResult, tPValue } from '../lib/regression-engine';
import {
  formatSPSSValue,
  formatSPSSSig,
  computeHarveyCollier,
  computeBreuschPaganStandard,
  runStepwiseVariableSelection
} from '../lib/regression-spss-compatibility';
import {
  computeHCCovariance,
  fitRobustRLM
} from '../lib/regression-remedial';
import {
  runModeratedRegressionAnalysis,
  MRAResult
} from '../lib/regression-moderation-mra';
import {
  runContingencyAnalysis,
  ContingencyAnalysisResult
} from '../lib/regression-contingency-chisquare';
import {
  calculateCorrelationMatrix,
  calculatePartialCorrelation
} from '../lib/regression-data-processor';
import {
  fitBinaryLogisticRegression,
  fitMultinomialLogisticRegression,
  fitOrdinalLogisticRegression,
  fitCountGLMRegression,
  fitQuantileRegression,
  fitPolynomialRegression
} from '../lib/regression-advanced-models';
import { runKFoldCrossValidation } from '../lib/regression-model-comparison';
import { ModerationPlots, ContingencyPlots } from './DiagnosticPlots';

interface AdvancedStatisticalSuitePanelProps {
  activeResult: OLSFitResult;
  allRows: Record<string, any>[];
  yCol: string;
  xCols: string[];
  alpha?: number;
}

export const AdvancedStatisticalSuitePanel: React.FC<AdvancedStatisticalSuitePanelProps> = ({
  activeResult,
  allRows,
  yCol,
  xCols,
  alpha = 0.05
}) => {
  const [activeSuiteTab, setActiveSuiteTab] = useState<'diagnostics' | 'mra' | 'contingency' | 'correlation' | 'glm'>('diagnostics');
  const [decimals, setDecimals] = useState<number>(3);
  const [hcMethod, setHcMethod] = useState<'HC0' | 'HC1' | 'HC2' | 'HC3' | 'HC4'>('HC3');
  const [selectionMethod, setSelectionMethod] = useState<'enter' | 'forward' | 'backward' | 'stepwise'>('stepwise');
  const [rlmMethod, setRlmMethod] = useState<'huber' | 'tukey'>('huber');

  // MRA state
  const allColumns = useMemo(() => (allRows.length > 0 ? Object.keys(allRows[0]) : [yCol, ...xCols]), [allRows, yCol, xCols]);
  const [mraX, setMraX] = useState<string>(xCols[0] || '');
  const [mraZ, setMraZ] = useState<string>(xCols[1] || allColumns.find(c => c !== yCol && c !== xCols[0]) || xCols[0] || '');
  const [mraCenter, setMraCenter] = useState<boolean>(true);
  const [mraCatMod, setMraCatMod] = useState<boolean>(false);
  const [mraCatCoding, setMraCatCoding] = useState<'dummy' | 'contrast'>('dummy');

  // Contingency state
  const [rowVar, setRowVar] = useState<string>(allColumns[0] || yCol);
  const [colVar, setColVar] = useState<string>(allColumns[1] || xCols[0] || yCol);

  // Partial correlation state
  const [partialX] = useState<string>(xCols[0] || yCol);
  const [partialY] = useState<string>(yCol);
  const [partialControl] = useState<string>(xCols[1] || xCols[0] || '');

  // Advanced GLM state
  const [glmType, setGlmType] = useState<'binary_logistic' | 'multinomial' | 'ordinal' | 'poisson' | 'negbin' | 'quantile' | 'polynomial'>('quantile');
  const [quantileTau] = useState<number>(0.5);
  const [polyDegree] = useState<2 | 3>(2);

  // Extract valid numeric arrays
  const validRows = useMemo(() => {
    return allRows.filter(
      r =>
        r[yCol] !== undefined &&
        r[yCol] !== null &&
        r[yCol] !== '' &&
        !isNaN(Number(r[yCol])) &&
        xCols.every(c => r[c] !== undefined && r[c] !== null && r[c] !== '' && !isNaN(Number(r[c])))
    );
  }, [allRows, yCol, xCols]);

  const rawY = useMemo(() => validRows.map(r => Number(r[yCol])), [validRows, yCol]);
  const rawX = useMemo(() => validRows.map(r => xCols.map(c => Number(r[c]))), [validRows, xCols]);
  const olsBetas = useMemo(() => activeResult.coefficients.map(c => c.b), [activeResult.coefficients]);

  // 1. Diagnostics & Robust Estimators
  const hcResult = useMemo(() => {
    if (rawY.length < xCols.length + 2) return null;
    try {
      return computeHCCovariance(rawY, rawX, olsBetas, hcMethod);
    } catch {
      return null;
    }
  }, [rawY, rawX, olsBetas, hcMethod, xCols.length]);

  const rlmResult = useMemo(() => {
    if (rawY.length < xCols.length + 2) return null;
    try {
      return fitRobustRLM(rawY, rawX, rlmMethod, 35);
    } catch {
      return null;
    }
  }, [rawY, rawX, rlmMethod, xCols.length]);

  const stepwiseResult = useMemo(() => {
    if (validRows.length < xCols.length + 3) return null;
    try {
      return runStepwiseVariableSelection({
        rows: validRows,
        yCol,
        candidateXCols: xCols,
        method: selectionMethod,
        pIn: 0.05,
        pOut: 0.10,
        alpha
      });
    } catch {
      return null;
    }
  }, [validRows, yCol, xCols, selectionMethod, alpha]);

  const harveyCollier = useMemo(() => {
    if (rawY.length < xCols.length + 5) return null;
    try {
      const resids = activeResult.plots.resVsFit.map(p => p.residual);
      return computeHarveyCollier(rawX, resids);
    } catch {
      return null;
    }
  }, [rawY.length, rawX, xCols.length, activeResult.plots.resVsFit]);

  const bpGodfrey = useMemo(() => {
    if (rawY.length < xCols.length + 3) return null;
    try {
      const resids = activeResult.plots.resVsFit.map(p => p.residual);
      return computeBreuschPaganStandard(rawX, resids);
    } catch {
      return null;
    }
  }, [rawY.length, xCols.length, activeResult.plots.resVsFit, rawX]);

  // 2. MRA Result
  const mraResult: MRAResult | null = useMemo(() => {
    if (!mraX || !mraZ || validRows.length < 6) return null;
    try {
      const controls = xCols.filter(c => c !== mraX && c !== mraZ);
      return runModeratedRegressionAnalysis({
        rows: allRows,
        yCol,
        xCol: mraX,
        zCol: mraZ,
        covariateCols: controls,
        centerVariables: mraCenter,
        isModeratorCategorical: mraCatMod,
        categoricalCoding: mraCatCoding,
        alpha
      });
    } catch {
      return null;
    }
  }, [allRows, validRows.length, yCol, mraX, mraZ, xCols, mraCenter, mraCatMod, mraCatCoding, alpha]);

  // 3. Contingency Result
  const contingencyResult: ContingencyAnalysisResult | null = useMemo(() => {
    if (!rowVar || !colVar || allRows.length < 2) return null;
    try {
      return runContingencyAnalysis({
        rows: allRows,
        rowVar,
        colVar,
        alpha
      });
    } catch {
      return null;
    }
  }, [allRows, rowVar, colVar, alpha]);

  // 4. Correlation Matrix & Partial Correlation
  const corrMatrix = useMemo(() => {
    if (validRows.length < 3) return null;
    try {
      return calculateCorrelationMatrix(validRows, [yCol, ...xCols]);
    } catch {
      return null;
    }
  }, [validRows, yCol, xCols]);

  const partialCorrResult = useMemo(() => {
    if (validRows.length < 5 || !partialX || !partialY || !partialControl) return null;
    try {
      return calculatePartialCorrelation(validRows, partialX, partialY, [partialControl]);
    } catch {
      return null;
    }
  }, [validRows, partialX, partialY, partialControl]);

  // 5. K-Fold CV
  const kFold5 = useMemo(() => {
    if (rawY.length < 10) return null;
    return runKFoldCrossValidation(rawY, rawX, 5);
  }, [rawY, rawX]);

  const dfRes = Math.max(1, activeResult.anova.residual.df);

  return (
    <div style={{
      background: 'var(--bg-card, #1e293b)',
      borderRadius: '10px',
      border: '1px solid var(--border-color, #334155)',
      padding: '18px',
      marginTop: '20px'
    }}>
      {/* Header & Precision Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
            🔬 Advanced Statistical Analysis Suite (Standar IBM SPSS Statistics)
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
            4 Uji Normalitas Serentak, Moderasi (MRA &amp; Johnson-Neyman), Crosstabs &amp; Chi-Square/Fisher, Korelasi Lengkap, GLM, dan Stepwise/Robust
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>Presisi Desimal:</label>
          <select
            value={decimals}
            onChange={(e) => setDecimals(Number(e.target.value))}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #334155)',
              background: 'var(--surface, #0f172a)',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '12px'
            }}
          >
            <option value={2}>2 Desimal</option>
            <option value={3}>3 Desimal (SPSS Default)</option>
            <option value={4}>4 Desimal</option>
            <option value={5}>5 Desimal</option>
          </select>
        </div>
      </div>

      {/* Suite Navigation Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px', borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '10px' }}>
        {([
          { id: 'diagnostics', label: '1. Normalitas (4 Uji), Robust HC0–HC4 & Stepwise' },
          { id: 'mra', label: '2. Moderasi (MRA) & Johnson-Neyman' },
          { id: 'contingency', label: '3. Crosstabs, Chi-Square, Fisher & Risk' },
          { id: 'correlation', label: '4. Korelasi (Pearson, Spearman, Kendall, Parsial)' },
          { id: 'glm', label: '5. Regresi Lanjutan (Logistik, Poisson, Kuantil, K-Fold)' }
        ] as Array<{ id: typeof activeSuiteTab; label: string }>).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSuiteTab(tab.id)}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: activeSuiteTab === tab.id ? '1px solid var(--accent-primary, #10b981)' : '1px solid var(--border-color, #334155)',
              background: activeSuiteTab === tab.id ? 'var(--accent-primary, #10b981)' : 'var(--surface-muted, #0f172a)',
              color: activeSuiteTab === tab.id ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: DIAGNOSTICS, 4 NORMALITY TESTS, ROBUST SE, STEPWISE */}
      {activeSuiteTab === 'diagnostics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 4 Normality Tests Table */}
          {activeResult.normalityTests && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)', marginBottom: '6px' }}>
                Tests of Normality (4 Metode Serentak: Shapiro-Wilk, Lilliefors K-S, Jarque-Bera, Anderson-Darling)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted, #0f172a)', borderBottom: '2px solid var(--border-color, #334155)' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Metode Uji Normalitas</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Statistik Uji</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>df / N</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Sig. (p-value)</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Keputusan (α = {alpha})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>Shapiro-Wilk (Royston AS R94)</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>W = {formatSPSSValue(activeResult.normalityTests.shapiroWilk.statistic, decimals)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{activeResult.normalityTests.shapiroWilk.df}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatSPSSSig(activeResult.normalityTests.shapiroWilk.pValue, decimals)}</td>
                    <td style={{ padding: '8px', color: activeResult.normalityTests.shapiroWilk.passed ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                      {activeResult.normalityTests.shapiroWilk.passed ? 'Normal (Gagal Tolak H0)' : 'Tidak Normal (Tolak H0)'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>Kolmogorov-Smirnov (Koreksi Lilliefors)</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>D = {formatSPSSValue(activeResult.normalityTests.lilliefors.statistic, decimals)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{activeResult.normalityTests.lilliefors.df}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatSPSSSig(activeResult.normalityTests.lilliefors.pValue, decimals)}</td>
                    <td style={{ padding: '8px', color: activeResult.normalityTests.lilliefors.passed ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                      {activeResult.normalityTests.lilliefors.passed ? 'Normal (Gagal Tolak H0)' : 'Tidak Normal (Tolak H0)'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>Anderson-Darling (Stephens A*²)</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>A² = {formatSPSSValue(activeResult.normalityTests.andersonDarling.statistic, decimals)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{activeResult.normalityTests.andersonDarling.df}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatSPSSSig(activeResult.normalityTests.andersonDarling.pValue, decimals)}</td>
                    <td style={{ padding: '8px', color: activeResult.normalityTests.andersonDarling.passed ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                      {activeResult.normalityTests.andersonDarling.passed ? 'Normal (Gagal Tolak H0)' : 'Tidak Normal (Tolak H0)'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>Jarque-Bera (Skewness = {activeResult.normalityTests.skewness.toFixed(2)}, Kurtosis = {activeResult.normalityTests.kurtosis.toFixed(2)})</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>JB = {formatSPSSValue(activeResult.normalityTests.jarqueBera.statistic, decimals)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>2</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatSPSSSig(activeResult.normalityTests.jarqueBera.pValue, decimals)}</td>
                    <td style={{ padding: '8px', color: activeResult.normalityTests.jarqueBera.passed ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                      {activeResult.normalityTests.jarqueBera.passed ? 'Normal (Gagal Tolak H0)' : 'Tidak Normal (Tolak H0)'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Additional Diagnostics: Harvey-Collier & Breusch-Pagan Godfrey */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
            {harveyCollier && (
              <div style={{ padding: '12px', borderRadius: '6px', background: 'var(--surface-muted, #0f172a)', border: '1px solid var(--border-color, #334155)' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                  Uji Linearitas Harvey-Collier (Recursive Residuals)
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', marginTop: '4px' }}>
                  t = <strong>{formatSPSSValue(harveyCollier.statistic, decimals)}</strong> | df = {harveyCollier.df} | Sig. = <strong>{formatSPSSSig(harveyCollier.pValue, decimals)}</strong>
                </div>
              </div>
            )}
            {bpGodfrey && (
              <div style={{ padding: '12px', borderRadius: '6px', background: 'var(--surface-muted, #0f172a)', border: '1px solid var(--border-color, #334155)' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                  Breusch-Pagan-Godfrey (Standard Normal-Theory LM)
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', marginTop: '4px' }}>
                  LM = <strong>{formatSPSSValue(bpGodfrey.statistic, decimals)}</strong> | df = {bpGodfrey.df} | Sig. = <strong>{formatSPSSSig(bpGodfrey.pValue, decimals)}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Robust Standard Errors HC0-HC4 & IRLS Robust Regression */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
            {hcResult && (
              <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted, #0f172a)', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Robust Covariance Matrix ({hcMethod})
                  </span>
                  <select
                    value={hcMethod}
                    onChange={(e) => setHcMethod(e.target.value as any)}
                    style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11.5px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                  >
                    <option value="HC0">HC0 (White)</option>
                    <option value="HC1">HC1 (df-corrected)</option>
                    <option value="HC2">HC2 (Leverage)</option>
                    <option value="HC3">HC3 (Jackknife - Default)</option>
                    <option value="HC4">HC4 (Cribari-Neto)</option>
                  </select>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '5px' }}>Variabel</th>
                      <th style={{ textAlign: 'right', padding: '5px' }}>Robust SE</th>
                      <th style={{ textAlign: 'right', padding: '5px' }}>t</th>
                      <th style={{ textAlign: 'right', padding: '5px' }}>Sig.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['(Constant)', ...xCols].map((v, i) => {
                      const se = hcResult.se[i] || 1e-6;
                      const b = olsBetas[i] || 0;
                      const tVal = b / se;
                      const pVal = tPValue(tVal, dfRes);
                      return (
                        <tr key={v} style={{ borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
                          <td style={{ padding: '5px', fontWeight: 600 }}>{v}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{formatSPSSValue(se, decimals)}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{formatSPSSValue(tVal, decimals)}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{formatSPSSSig(pVal, decimals)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {rlmResult && (
              <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted, #0f172a)', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Regresi Robust IRLS ({rlmMethod === 'huber' ? 'Huber M' : 'Tukey Bisquare'})
                  </span>
                  <select
                    value={rlmMethod}
                    onChange={(e) => setRlmMethod(e.target.value as any)}
                    style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11.5px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                  >
                    <option value="huber">Huber M-Estimator</option>
                    <option value="tukey">Tukey Bisquare</option>
                  </select>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '5px' }}>Variabel</th>
                      <th style={{ textAlign: 'right', padding: '5px' }}>B (Robust)</th>
                      <th style={{ textAlign: 'right', padding: '5px' }}>SE</th>
                      <th style={{ textAlign: 'right', padding: '5px' }}>Sig.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['(Constant)', ...xCols].map((v, i) => {
                      const b = rlmResult.coefficients[i] || 0;
                      const se = rlmResult.stdErrors[i] || 1e-6;
                      const pVal = tPValue(b / se, dfRes);
                      return (
                        <tr key={v} style={{ borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
                          <td style={{ padding: '5px', fontWeight: 600 }}>{v}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{formatSPSSValue(b, decimals)}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{formatSPSSValue(se, decimals)}</td>
                          <td style={{ padding: '5px', textAlign: 'right' }}>{formatSPSSSig(pVal, decimals)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Stepwise Variable Selection */}
          {stepwiseResult && (
            <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted, #0f172a)', border: '1px solid var(--border-color, #334155)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Metode Seleksi Variabel SPSS ({selectionMethod.toUpperCase()})
                </span>
                <select
                  value={selectionMethod}
                  onChange={(e) => setSelectionMethod(e.target.value as any)}
                  style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                >
                  <option value="enter">Enter (Forced Entry)</option>
                  <option value="stepwise">Stepwise (PIN ≤ .05, POUT ≥ .10)</option>
                  <option value="forward">Forward Selection (PIN ≤ .05)</option>
                  <option value="backward">Backward Elimination (POUT ≥ .10)</option>
                </select>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Variabel Terpilih Akhir: <strong>{stepwiseResult.selectedXCols.join(', ')}</strong> | R² Akhir = <strong>{formatSPSSValue(stepwiseResult.finalFit.modelSummary.rSquared, decimals)}</strong> | Adj R² = <strong>{formatSPSSValue(stepwiseResult.finalFit.modelSummary.adjRSquared, decimals)}</strong> ({stepwiseResult.steps.length} langkah)
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MODERATED REGRESSION ANALYSIS (MRA) & JOHNSON-NEYMAN */}
      {activeSuiteTab === 'mra' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', padding: '12px', borderRadius: '8px', background: 'var(--surface-muted, #0f172a)' }}>
            <div>
              <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block' }}>Prediktor Utama (X):</label>
              <select value={mraX} onChange={(e) => setMraX(e.target.value)} style={{ padding: '5px 8px', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {allColumns.filter(c => c !== yCol).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block' }}>Variabel Moderator (Z):</label>
              <select value={mraZ} onChange={(e) => setMraZ(e.target.value)} style={{ padding: '5px 8px', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {allColumns.filter(c => c !== yCol && c !== mraX).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer', marginTop: '14px' }}>
              <input type="checkbox" checked={mraCenter} onChange={(e) => setMraCenter(e.target.checked)} />
              Mean Centering (X_c &amp; Z_c)
            </label>
          </div>

          {mraResult ? (
            <>
              {/* Moderator Classification Banner */}
              <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--info-bg)', border: '1px solid var(--info-border)', color: 'var(--info-text)' }}>
                <div style={{ fontWeight: 700, fontSize: '13.5px' }}>
                  Klasifikasi Tipe Moderator (Sharma, Durand, &amp; Gur-Arie, 1981): {mraResult.moderatorClassification.type}
                </div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  {mraResult.moderatorClassification.rationale}
                </div>
              </div>

              {/* Hierarchical 3-Model Summary Table */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  Tabel Ringkasan Hierarkis 3-Model MRA &amp; Change Statistics (SPSS Blockwise)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)', borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '7px', textAlign: 'left' }}>Model</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>R</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>R Square</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>Adj. R²</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>ΔR² (R Square Change)</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>F Change</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>df1 / df2</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>Sig. F Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[mraResult.models.model1, mraResult.models.model2, mraResult.models.model3].map((row) => (
                      <tr key={row.modelNumber} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '7px', fontWeight: 600 }}>Model {row.modelNumber}: {row.modelName}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(row.fit.modelSummary.r, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(row.fit.modelSummary.rSquared, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(row.fit.modelSummary.adjRSquared, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>+{formatSPSSValue(row.changeStats.rSquaredChange, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(row.changeStats.fChange, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{row.changeStats.df1} / {row.changeStats.df2}</td>
                        <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>{formatSPSSSig(row.changeStats.sigFChange, decimals)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Simple Slopes Table */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  Analisis Simple Slope (Efek Kondisional X → Y pada -1 SD, Mean, +1 SD Moderator)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)', borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '7px', textAlign: 'left' }}>Tingkat Moderator ({mraResult.zCol})</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>Nilai Z (Asli)</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>Conditional Slope (b)</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>Std. Error</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>t-value</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>Sig. (p)</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>95% CI [Lower, Upper]</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mraResult.simpleSlopes.map((s) => (
                      <tr key={s.levelLabel} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '7px', fontWeight: 600 }}>{s.levelLabel}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(s.zRaw, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>{formatSPSSValue(s.slope, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(s.stdError, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(s.tStat, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right', color: s.isSignificant ? '#10b981' : 'var(--text-secondary)', fontWeight: 700 }}>
                          {formatSPSSSig(s.pValue, decimals)}
                        </td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>
                          [{formatSPSSValue(s.ciLower, decimals)}, {formatSPSSValue(s.ciUpper, decimals)}]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Johnson-Neyman Summary */}
              <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'var(--surface-muted)', fontSize: '12px' }}>
                <strong>Johnson-Neyman Region of Significance:</strong> {mraResult.johnsonNeyman.regionsDescription}
              </div>

              <ModerationPlots mra={mraResult} />
            </>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Pilih variabel Prediktor (X) dan Moderator (Z) yang berbeda untuk menjalankan analisis MRA.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CONTINGENCY TABLE (CROSSTABS), CHI-SQUARE, FISHER & RISK */}
      {activeSuiteTab === 'contingency' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)' }}>
            <div>
              <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block' }}>Variabel Baris (Row):</label>
              <select value={rowVar} onChange={(e) => setRowVar(e.target.value)} style={{ padding: '5px 8px', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {allColumns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block' }}>Variabel Kolom (Column):</label>
              <select value={colVar} onChange={(e) => setColVar(e.target.value)} style={{ padding: '5px 8px', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {allColumns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {contingencyResult && (
            <>
              <div style={{ padding: '10px 14px', borderRadius: '6px', background: contingencyResult.expectedCountDiagnostics.meetsChiSquareAssumption ? 'var(--success-bg)' : 'var(--warn-bg)', color: contingencyResult.expectedCountDiagnostics.meetsChiSquareAssumption ? 'var(--success-text)' : 'var(--warn-text)', fontSize: '12px' }}>
                <strong>Dimensi Tabel {contingencyResult.tableDimensions.typeLabel}:</strong> Rekomendasi Uji Utama: {contingencyResult.expectedCountDiagnostics.recommendedPrimaryTest} (Sel E &lt; 5: {contingencyResult.expectedCountDiagnostics.cellsBelow5Percent}%).
              </div>

              {/* Chi-Square Tests Table */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  Chi-Square Tests ({contingencyResult.rowVar} × {contingencyResult.colVar})
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)', borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '7px', textAlign: 'left' }}>Statistik Uji</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>Value</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>df</th>
                      <th style={{ padding: '7px', textAlign: 'right' }}>Asymp. / Exact Sig. (2-sided)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contingencyResult.chiSquareTests.map((t) => (
                      <tr key={t.testName} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '7px', fontWeight: 600 }}>{t.testName}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(t.value, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{t.df}</td>
                        <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>
                          {formatSPSSSig(t.asympSig2Sided ?? t.exactSig2Sided ?? t.monteCarloSig, decimals)}
                        </td>
                      </tr>
                    ))}
                    {contingencyResult.symmetricMeasures.map((m) => (
                      <tr key={m.measureName} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '7px', fontWeight: 600 }}>Symmetric Measure: {m.measureName}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(m.value, decimals)}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{m.interpretation}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSSig(m.approxSig, decimals)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {contingencyResult.riskEstimates.is2x2 && contingencyResult.riskEstimates.oddsRatio && (
                <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'var(--surface-muted)', fontSize: '12px' }}>
                  <strong>Risk Estimates (2×2):</strong> Odds Ratio (OR) = <strong>{formatSPSSValue(contingencyResult.riskEstimates.oddsRatio.value, decimals)}</strong> (95% CI [{formatSPSSValue(contingencyResult.riskEstimates.oddsRatio.ciLower, decimals)}, {formatSPSSValue(contingencyResult.riskEstimates.oddsRatio.ciUpper, decimals)}]) | Relative Risk (RR) = <strong>{formatSPSSValue(contingencyResult.riskEstimates.relativeRiskCol1?.value, decimals)}</strong>
                </div>
              )}

              <ContingencyPlots data={contingencyResult} />
            </>
          )}
        </div>
      )}

      {/* TAB 4: FULL CORRELATION MATRIX (PEARSON, SPEARMAN, KENDALL TAU-B, PARTIAL) */}
      {activeSuiteTab === 'correlation' && corrMatrix && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
              Matriks Korelasi Bivariat Lengkap: Pearson (r), Spearman (ρ), Kendall&apos;s Tau-b (τ_b) &amp; 95% CI
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)', borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '7px', textAlign: 'left' }}>Pasangan Variabel</th>
                  <th style={{ padding: '7px', textAlign: 'right' }}>Pearson r (Sig.)</th>
                  <th style={{ padding: '7px', textAlign: 'right' }}>95% CI Pearson</th>
                  <th style={{ padding: '7px', textAlign: 'right' }}>Spearman ρ</th>
                  <th style={{ padding: '7px', textAlign: 'right' }}>Kendall τ_b</th>
                </tr>
              </thead>
              <tbody>
                {corrMatrix.variables.flatMap((v1, i) =>
                  corrMatrix.variables.slice(i + 1).map((v2) => {
                    const ci = corrMatrix.confidenceIntervals95?.[v1]?.[v2] || { lower: -1, upper: 1 };
                    return (
                      <tr key={`${v1}-${v2}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '7px', fontWeight: 600 }}>{v1} ↔ {v2}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>
                          {formatSPSSValue(corrMatrix.pearson[v1][v2], decimals)} (p={formatSPSSSig(corrMatrix.pValues[v1][v2], decimals)})
                        </td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>
                          [{formatSPSSValue(ci.lower, decimals)}, {formatSPSSValue(ci.upper, decimals)}]
                        </td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>
                          {formatSPSSValue(corrMatrix.spearman[v1][v2], decimals)}
                        </td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>
                          {formatSPSSValue(corrMatrix.kendallTauB?.[v1]?.[v2], decimals)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {partialCorrResult && (
            <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)', fontSize: '12px' }}>
              <strong>Korelasi Parsial (Partial Correlation):</strong> Korelasi antara <strong>{partialX}</strong> dan <strong>{partialY}</strong> dengan mengendalikan <strong>{partialControl}</strong>: r_partial = <strong>{formatSPSSValue(partialCorrResult.rPartial, decimals)}</strong> (t = {formatSPSSValue(partialCorrResult.tStat, decimals)}, df = {partialCorrResult.df}, Sig. = {formatSPSSSig(partialCorrResult.pValue, decimals)}).
            </div>
          )}
        </div>
      )}

      {/* TAB 5: ADVANCED REGRESSION, GLM & K-FOLD CV */}
      {activeSuiteTab === 'glm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Pilih Model Lanjutan / GLM:</label>
            <select value={glmType} onChange={(e) => setGlmType(e.target.value as any)} style={{ padding: '5px 10px', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '12px' }}>
              <option value="quantile">Quantile Regression (L1 Median / Kuantil τ)</option>
              <option value="polynomial">Polynomial Regression (Orde 2 &amp; 3 Terpusat)</option>
              <option value="poisson">Poisson Regression (Count GLM)</option>
              <option value="negbin">Negative Binomial Regression (Overdispersed Count GLM)</option>
              <option value="binary_logistic">Binary Logistic Regression (Logit MLE)</option>
              <option value="ordinal">Ordinal Logistic Regression (PLUM Proportional Odds)</option>
              <option value="multinomial">Multinomial Logistic Regression (Softmax MLE)</option>
            </select>
          </div>

          {/* Render selected GLM output safely */}
          {(() => {
            try {
              if (glmType === 'quantile') {
                const qRes = fitQuantileRegression({ rows: validRows, yCol, xCols, tau: quantileTau, alpha });
                return (
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                      Regresi Kuantil (τ = {qRes.quantileTau}) — Pseudo-R¹ Koenker-Machado = {formatSPSSValue(qRes.pseudoR1, decimals)} | MAE = {formatSPSSValue(qRes.mae, decimals)}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-muted)', borderBottom: '2px solid var(--border-color)' }}>
                          <th style={{ padding: '7px', textAlign: 'left' }}>Variabel</th>
                          <th style={{ padding: '7px', textAlign: 'right' }}>Koefisien (B)</th>
                          <th style={{ padding: '7px', textAlign: 'right' }}>Std. Error</th>
                          <th style={{ padding: '7px', textAlign: 'right' }}>t</th>
                          <th style={{ padding: '7px', textAlign: 'right' }}>Sig.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qRes.coefficients.map(c => (
                          <tr key={c.variable} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '7px', fontWeight: 600 }}>{c.variable}</td>
                            <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(c.b, decimals)}</td>
                            <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(c.stdError, decimals)}</td>
                            <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(c.t, decimals)}</td>
                            <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSSig(c.sig, decimals)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }
              if (glmType === 'polynomial') {
                const pRes = fitPolynomialRegression({ rows: validRows, yCol, xCol: xCols[0], degree: polyDegree, alpha });
                return (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)', fontSize: '12px' }}>
                    <strong>Regresi Polinomial Orde {pRes.degree} ({xCols[0]}):</strong> R² Linear = {formatSPSSValue(pRes.linearFit.modelSummary.rSquared, decimals)} → R² Polinomial = <strong>{formatSPSSValue(pRes.polynomialFit.modelSummary.rSquared, decimals)}</strong> (ΔR² = +{formatSPSSValue(pRes.rSquaredChange, decimals)}, F Change = {formatSPSSValue(pRes.fChange, decimals)}, Sig. = {formatSPSSSig(pRes.sigFChange, decimals)}).
                  </div>
                );
              }
              if (glmType === 'poisson' || glmType === 'negbin') {
                const cRes = fitCountGLMRegression({ rows: validRows, yCol, xCols, family: glmType === 'poisson' ? 'poisson' : 'negative_binomial', alpha });
                return (
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                      {glmType === 'poisson' ? 'Poisson GLM' : 'Negative Binomial GLM'} — Deviance = {formatSPSSValue(cRes.goodnessOfFit.deviance, decimals)} | Dispersion Ratio = {formatSPSSValue(cRes.goodnessOfFit.dispersionRatio, decimals)} | AIC = {formatSPSSValue(cRes.goodnessOfFit.aic, decimals)}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-muted)', borderBottom: '2px solid var(--border-color)' }}>
                          <th style={{ padding: '7px', textAlign: 'left' }}>Variabel</th>
                          <th style={{ padding: '7px', textAlign: 'right' }}>B</th>
                          <th style={{ padding: '7px', textAlign: 'right' }}>SE</th>
                          <th style={{ padding: '7px', textAlign: 'right' }}>IRR = Exp(B)</th>
                          <th style={{ padding: '7px', textAlign: 'right' }}>Sig.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cRes.parameterEstimates.map(c => (
                          <tr key={c.variable} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '7px', fontWeight: 600 }}>{c.variable}</td>
                            <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(c.b, decimals)}</td>
                            <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSValue(c.stdError, decimals)}</td>
                            <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>{formatSPSSValue(c.expB, decimals)}</td>
                            <td style={{ padding: '7px', textAlign: 'right' }}>{formatSPSSSig(c.sig, decimals)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }
              if (glmType === 'binary_logistic') {
                const bRes = fitBinaryLogisticRegression({ rows: validRows, yCol, xCols, alpha });
                return (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)', fontSize: '12px' }}>
                    <strong>Binary Logistic Regression:</strong> -2LL = {formatSPSSValue(bRes.modelSummary.minus2LogLikelihood, decimals)} | Nagelkerke R² = <strong>{formatSPSSValue(bRes.modelSummary.nagelkerkeR2, decimals)}</strong> | Akurasi Klasifikasi = <strong>{bRes.classificationTable.overallPercentage.toFixed(1)}%</strong>
                  </div>
                );
              }
              if (glmType === 'ordinal') {
                const oRes = fitOrdinalLogisticRegression({ rows: validRows, yCol, xCols, alpha });
                return (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)', fontSize: '12px' }}>
                    <strong>Ordinal Logistic Regression (PLUM):</strong> Nagelkerke R² = <strong>{formatSPSSValue(oRes.pseudoR2.nagelkerke, decimals)}</strong> | McFadden R² = {formatSPSSValue(oRes.pseudoR2.mcFadden, decimals)} ({oRes.locations.length} prediktor lokasi, {oRes.thresholds.length} ambang batas).
                  </div>
                );
              }
              if (glmType === 'multinomial') {
                const mRes = fitMultinomialLogisticRegression({ rows: validRows, yCol, xCols, alpha });
                return (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)', fontSize: '12px' }}>
                    <strong>Multinomial Logistic Regression:</strong> Kategori Referensi = <strong>{mRes.referenceCategory}</strong> | Nagelkerke R² = <strong>{formatSPSSValue(mRes.pseudoR2.nagelkerke, decimals)}</strong> | LR Chi-Square = {formatSPSSValue(mRes.modelFittingInfo.chiSquare, decimals)} (Sig. = {formatSPSSSig(mRes.modelFittingInfo.sig, decimals)}).
                  </div>
                );
              }
            } catch (err: any) {
              return (
                <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--warn-bg)', color: 'var(--warn-text)', fontSize: '12px' }}>
                  Catatan Model: {err?.message || 'Variabel dependen tidak memenuhi syarat skala untuk model GLM ini.'}
                </div>
              );
            }
            return null;
          })()}

          {/* K-Fold Cross Validation Summary */}
          {kFold5 && (
            <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--surface-muted)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, marginBottom: '4px' }}>
                Evaluasi Out-of-Sample: {kFold5.kFolds}-Fold Cross-Validation
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Mean MSE = <strong>{formatSPSSValue(kFold5.meanMse, decimals)}</strong> | Mean RMSE = <strong>{formatSPSSValue(kFold5.meanRmse, decimals)}</strong> (±{formatSPSSValue(kFold5.stdRmse, decimals)}) | Mean MAE = <strong>{formatSPSSValue(kFold5.meanMae, decimals)}</strong> | Mean Out-of-Sample R² = <strong>{formatSPSSValue(kFold5.meanRSquared, decimals)}</strong>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
