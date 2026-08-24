'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { UploadTab } from '@/components/UploadTab';
import { ResultsTab } from '@/components/ResultsTab';
import { GuideTab } from '@/components/GuideTab';
import { SettingsTab } from '@/components/SettingsTab';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'upload' | 'results' | 'guide' | 'settings'>('upload');
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
      </main>
    </div>
  );
}
