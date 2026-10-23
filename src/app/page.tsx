'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { NavigationDrawer } from '@/components/NavigationDrawer';
import { UploadTab } from '@/components/UploadTab';
import { ResultsTab } from '@/components/ResultsTab';
import { GuideTab } from '@/components/GuideTab';
import { SettingsTab } from '@/components/SettingsTab';
import { RegressionTab } from '@/components/RegressionTab';
import { PanelTabShell } from '@/components/PanelTabShell';
import { useSupabaseKeepalive } from '@/hooks/useSupabaseKeepalive';

export default function HomePage() {
  useSupabaseKeepalive();
  const [activeTab, setActiveTab] = useState<'upload' | 'results' | 'guide' | 'settings' | 'regression' | 'panel'>('upload');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const [supabaseStatus, setSupabaseStatus] = useState({ configured: false, connected: false });
  const [refreshResultsCount, setRefreshResultsCount] = useState(0);

  const checkConnection = async () => {
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.success && json.data?.supabase) {
        setSupabaseStatus({
          configured: json.data.supabase.configured,
          connected: json.data.supabase.connected
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const handleSuccessfulAnalysis = () => {
    setRefreshResultsCount(prev => prev + 1);
    checkConnection();
  };

  return (
    <div>
      <Header
        supabaseStatus={supabaseStatus}
        activeTab={activeTab}
        onTabChange={(tab: string) => setActiveTab(tab as any)}
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen(prev => !prev)}
        toggleButtonRef={toggleButtonRef}
      />

      <NavigationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeTab={activeTab}
        onSelectTab={(tab: string) => setActiveTab(tab as any)}
        toggleButtonRef={toggleButtonRef}
      />

      <main className="main-container">
        {activeTab === 'upload' && (
          <UploadTab
            onSuccessAnalysis={handleSuccessfulAnalysis}
            onNavigateToResults={() => setActiveTab('results')}
          />
        )}

        {activeTab === 'results' && (
          <ResultsTab refreshTrigger={refreshResultsCount} />
        )}

        {activeTab === 'guide' && (
          <GuideTab />
        )}

        {activeTab === 'settings' && (
          <SettingsTab />
        )}

        {activeTab === 'regression' && (
          <RegressionTab />
        )}

        {activeTab === 'panel' && (
          <PanelTabShell />
        )}
      </main>
    </div>
  );
}
