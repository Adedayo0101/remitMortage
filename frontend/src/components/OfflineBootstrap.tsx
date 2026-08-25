'use client';

import { useEffect } from 'react';
import OfflineIndicator from './OfflineIndicator';
import { registerServiceWorker } from '@/lib/serviceWorker';

export function OfflineBootstrap() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return <OfflineIndicator />;
}
