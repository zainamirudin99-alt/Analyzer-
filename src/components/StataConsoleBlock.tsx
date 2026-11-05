'use client';

import React, { useState } from 'react';
import { StataConsoleBlockData } from '@/lib/panel-types';
import { Copy, Check, Terminal, Lightbulb, BookOpen } from 'lucide-react';

interface StataConsoleBlockProps {
  block: StataConsoleBlockData;
}

export const StataConsoleBlock: React.FC<StataConsoleBlockProps> = ({ block }) => {
  const [copied, setCopied] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(block.stataCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const handleCopyOutput = async () => {
    try {
      await navigator.clipboard.writeText(block.stataOutput);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    } catch (e) {
      console.error('Failed to copy output', e);
    }
  };

  const renderFormattedStataLines = (rawOutput: string) => {
    const lines = rawOutput.split('\n');
    return lines.map((line, idx) => {
      const isDivider = /^[-+=]{10,}$/.test(line.trim());
      const isHeaderRow =
        line.includes('| Coefficient') ||
        line.includes('|      Mean   Std. dev.') ||
        line.includes('|       VIF') ||
        line.includes('|       Obs');
      const isWarning = line.startsWith('Small Cluster Warning') || line.startsWith('Cluster-robust');

      return (
        <div
          key={idx}
          style={{
            color: isDivider
              ? '#6ea864'
              : isHeaderRow
              ? '#fde047'
              : isWarning
              ? '#fca5a5'
              : '#eef7eb',
            fontWeight: isHeaderRow ? 700 : 400,
            minHeight: '1.45em'
          }}
        >
          {line || ' '}
        </div>
      );
    });
  };

  return (
    <div
      className="stata-block-card"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow)',
        minWidth: 0,
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Header Langkah */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '12px',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              background: 'var(--primary)',
              color: '#ffffff',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700
            }}
          >
            Langkah {block.stepIndex}
          </span>
          <h3
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--text)',
              margin: 0
            }}
          >
            {block.stepTitle}
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleCopy}
            aria-label="Salin perintah Stata"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: copied ? 'var(--primary-glow)' : 'transparent',
              border: '1px solid var(--border)',
              color: copied ? 'var(--primary)' : 'var(--text-muted)',
              borderRadius: '8px',
              padding: '8px 14px',
              minHeight: '40px',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            <span>{copied ? 'Kode Tersalin' : 'Salin Kode'}</span>
          </button>

          <button
            onClick={handleCopyOutput}
            aria-label="Salin tabel output Stata"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: copiedOutput ? 'var(--primary-glow)' : 'transparent',
              border: '1px solid var(--border)',
              color: copiedOutput ? 'var(--primary)' : 'var(--text-muted)',
              borderRadius: '8px',
              padding: '8px 14px',
              minHeight: '40px',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            {copiedOutput ? <Check size={15} /> : <Copy size={15} />}
            <span>{copiedOutput ? 'Output Tersalin' : 'Salin Tabel Output'}</span>
          </button>
        </div>
      </div>

      {/* 1. Kode Perintah Stata */}
      <div style={{ marginBottom: '14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--stone, #687962)',
            marginBottom: '6px'
          }}
        >
          <Terminal size={15} />
          <span>(1) Kode Perintah Stata (Sintaks Resmi)</span>
        </div>
        <div
          style={{
            background: '#111811',
            color: '#a3e635',
            padding: '12px 16px',
            borderRadius: '8px',
            fontFamily: "'Consolas', 'Courier New', monospace",
            fontSize: '13.5px',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.5,
            border: '1px solid #233321',
            minWidth: 0,
            maxWidth: '100%',
            boxSizing: 'border-box'
          }}
        >
          {block.stataCommand}
        </div>
      </div>

      {/* 2. Fungsi Kode */}
      <div style={{ marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--stone, #687962)',
            marginBottom: '4px'
          }}
        >
          <BookOpen size={15} />
          <span>(2) Fungsi Metodologis</span>
        </div>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--bark, #2b221a)',
            margin: 0,
            lineHeight: 1.6
          }}
        >
          {block.stataFunction}
        </p>
      </div>

      {/* 3. Output Monospace Gaya Stata */}
      <div style={{ marginBottom: '16px', minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--stone, #687962)',
            marginBottom: '6px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Terminal size={15} />
            <span>(3) Output Terminal Gaya Stata (Rapi &amp; Sejajar Presisi)</span>
          </div>
          <span style={{ fontSize: '11.5px', color: 'var(--primary)', fontWeight: 700 }}>
            Stata 18 Results Window
          </span>
        </div>
        <pre
          className="stata-terminal"
          style={{
            background: '#0b110a',
            color: '#eef7eb',
            padding: '18px 20px',
            borderRadius: '10px',
            fontFamily: "'Consolas', 'Lucida Console', 'Courier New', monospace",
            fontVariantNumeric: 'tabular-nums',
            fontSize: '13px',
            letterSpacing: '0px',
            overflowX: 'auto',
            whiteSpace: 'pre',
            lineHeight: 1.5,
            border: '1px solid #263823',
            boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.45)',
            margin: 0,
            minWidth: 0,
            maxWidth: '100%',
            boxSizing: 'border-box'
          }}
        >
          {renderFormattedStataLines(block.stataOutput)}
        </pre>
      </div>

      {/* 4. Penjelasan Bahasa Bayi */}
      <div
        style={{
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          gap: '12px'
        }}
      >
        <div
          style={{
            color: 'var(--primary)',
            marginTop: '2px',
            flexShrink: 0
          }}
        >
          <Lightbulb size={20} />
        </div>
        <div>
          <h4
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--text)',
              margin: '0 0 4px 0'
            }}
          >
            (4) Penjelasan Bahasa Bayi (Analogi Awam)
          </h4>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.6
            }}
          >
            {block.babyLanguage}
          </p>
        </div>
      </div>
    </div>
  );
};
