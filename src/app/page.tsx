'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { NavigationDrawer } from '@/components/NavigationDrawer';
import { UploadTab } from '@/components/UploadTab';
import { ResultsTab } from '@/components/ResultsTab';
import { GuideTab } from '@/components/GuideTab';
import { SettingsTab } from '@/components/SettingsTab';
import { RegressionTab } from '@/components/RegressionTab';
import { PanelTabHub } from '@/components/PanelTabHub';
import { AuthGate } from '@/components/AuthGate';
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
      const { getAuthHeaders } = await import('@/lib/account-sync');
      const res = await fetch('/api/settings', {
        headers: getAuthHeaders()
      });
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
    const handleUpdate = () => checkConnection();
    const handleWindowFocus = async () => {
      try {
        const { hydrateFromAccount } = await import('@/lib/account-sync');
        await hydrateFromAccount();
      } catch {}
      checkConnection();
    };

    window.addEventListener('analyzer-settings-changed', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('analyzer-settings-changed', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  const handleSuccessfulAnalysis = () => {
    setRefreshResultsCount(prev => prev + 1);
    checkConnection();
  };

  return (
    <AuthGate>
      {({ user, onLogout }) => (
        <div>
          <Header
            supabaseStatus={supabaseStatus}
            activeTab={activeTab}
            onTabChange={(tab: string) => setActiveTab(tab as any)}
            isDrawerOpen={isDrawerOpen}
            onToggleDrawer={() => setIsDrawerOpen(prev => !prev)}
            toggleButtonRef={toggleButtonRef}
            currentUser={user}
            onLogout={onLogout}
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
              <PanelTabHub />
            )}
          </main>
        </div>
      )}
    </AuthGate>
  );
}
