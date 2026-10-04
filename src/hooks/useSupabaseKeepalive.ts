import { useEffect, useRef } from 'react';

/**
 * useSupabaseKeepalive
 * 
 * Silent client-side background heartbeat.
 * Melakukan ping ringan periodik ke /api/cron/keepalive saat aplikasi dibuka di tab browser.
 * Berjalan tanpa memblokir rendering UI dan sepenuhnya aman dari error/offline.
 */
export function useSupabaseKeepalive(intervalMs: number = 15 * 60 * 1000) {
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;

    const triggerPing = async () => {
      try {
        await fetch('/api/cron/keepalive', {
          method: 'GET',
          headers: { 'x-client-heartbeat': 'web-browser' },
          cache: 'no-store'
        });
      } catch {
        // Silently ignore network errors so user experience is never disturbed
      }
    };

    // Ping pertama dilakukan 3 detik setelah halaman stabil
    const initialTimer = setTimeout(() => {
      if (isMountedRef.current) {
        triggerPing();
      }
    }, 3000);

    // Looping heartbeat setiap interval (default 15 menit)
    const intervalTimer = setInterval(() => {
      if (isMountedRef.current && typeof document !== 'undefined' && !document.hidden) {
        triggerPing();
      }
    }, intervalMs);

    return () => {
      isMountedRef.current = false;
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [intervalMs]);
}
