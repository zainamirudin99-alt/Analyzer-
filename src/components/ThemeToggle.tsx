'use client';

import React from 'react';
import { Sun, Moon, Sparkles } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useLanguage } from '@/lib/i18n';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', showLabel = false }) => {
  const { theme, toggleTheme, isDark } = useTheme();
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const tooltipText = isDark
    ? isEn
      ? 'Switch to Ultraman Blazar & Scientific Light Mode'
      : 'Beralih ke Mode Terang (Ultraman Blazar & Scientific)'
    : isEn
      ? 'Switch to Godzilla & EVA-01 Atomic Dark Mode'
      : 'Beralih ke Mode Gelap (Godzilla & EVA-01 Atomic)';

  return (
    <button
      type="button"
      className={`theme-toggle-btn ${className}`}
      onClick={toggleTheme}
      aria-label={tooltipText}
      title={tooltipText}
      data-testid="theme-toggle-btn"
    >
      <span className="theme-toggle-glow" />
      <span className="theme-toggle-icon-wrap">
        {isDark ? (
          <Sun size={17} className="theme-icon sun-icon" />
        ) : (
          <Moon size={17} className="theme-icon moon-icon" />
        )}
      </span>
      {showLabel && (
        <span className="theme-toggle-label">
          {isDark ? (isEn ? 'Light Lab' : 'Mode Terang') : (isEn ? 'Atomic Dark' : 'Mode Gelap')}
        </span>
      )}
    </button>
  );
};

