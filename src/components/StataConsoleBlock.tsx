'use client';

import React, { useState } from 'react';
import { StataConsoleBlockData } from '@/lib/panel-types';
import { Copy, Check, Terminal, Lightbulb, BookOpen } from 'lucide-react';

interface StataConsoleBlockProps {
  block: StataConsoleBlockData;
}

export const StataConsoleBlock: React.FC<StataConsoleBlockProps> = ({ block }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(block.stataCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  return (
    <div
      className="stata-block-card"
      style={{
        background: 'var(--card, #ffffff)',
        border: '1px solid var(--border, #d2e2ca)',
        borderRadius: 'var(--radius, 16px)',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow, 0 4px 20px rgba(30, 61, 20, 0.08))'
      }}
    >
      {/* Header Langkah */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          borderBottom: '1px solid var(--border-light, #e4efe0)',
          paddingBottom: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              background: 'var(--fern, #2e6922)',
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
              color: 'var(--bark, #2b221a)',
              margin: 0
            }}
          >
            {block.stepTitle}
          </h3>
        </div>

        <button
          onClick={handleCopy}
          aria-label="Salin perintah Stata"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: copied ? 'var(--dew, #eef7eb)' : 'transparent',
            border: '1px solid var(--border, #d2e2ca)',
            color: copied ? 'var(--fern, #2e6922)' : 'var(--stone, #687962)',
            borderRadius: '8px',
            padding: '8px 14px',
            minHeight: '44px',
            minWidth: '44px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            transition: 'all 0.2s ease'
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? 'Tersalin' : 'Salin Kode'}</span>
        </button>
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
            background: '#151d14',
            color: '#a3e635',
            padding: '12px 16px',
            borderRadius: '8px',
            fontFamily: "'DM Mono', monospace",
            fontSize: '14px',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5
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
      <div style={{ marginBottom: '16px' }}>
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
          <span>(3) Output Terminal Gaya Stata</span>
        </div>
        <pre
          className="stata-terminal"
          style={{
            background: '#0e140d',
            color: '#e4efe0',
            padding: '16px',
            borderRadius: '8px',
            fontFamily: "'DM Mono', Courier, monospace",
            fontSize: '13px',
            overflowX: 'auto',
            whiteSpace: 'pre',
            lineHeight: 1.45,
            border: '1px solid #233321'
          }}
        >
          {block.stataOutput}
        </pre>
      </div>

      {/* 4. Penjelasan Bahasa Bayi */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--dew, #eef7eb) 0%, #f4fbf1 100%)',
          border: '1px solid var(--sage, #7cb862)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          gap: '12px'
        }}
      >
        <div
          style={{
            color: 'var(--fern, #2e6922)',
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
              color: 'var(--moss, #1e3d14)',
              margin: '0 0 4px 0'
            }}
          >
            (4) Penjelasan Bahasa Bayi (Analogi Awam)
          </h4>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--bark, #2b221a)',
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
