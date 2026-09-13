import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { flushOfflineQueue, startOfflineSync } from '../../api/axiosClient';
import { queueSize } from '../../lib/offlineQueue';

/**
 * Tells a worker whether the platform currently has their action.
 *
 * Someone on intermittent data needs to know the difference between "saved,
 * will send" and "lost". Without that they retap, producing duplicates, or
 * assume it worked when it did not — and both are worse on a metered
 * connection than an honest line of text.
 */
const OfflineBanner = () => {
  const { t } = useTranslation();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => queueSize().then(setPending);
    const goOnline = () => {
      setOnline(true);
      flushOfflineQueue().finally(refresh);
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const stopSync = startOfflineSync();

    refresh();
    const poll = setInterval(refresh, 4000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(poll);
      stopSync();
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <Alert
      type={online ? 'info' : 'warning'}
      showIcon
      banner
      message={
        online ? t('offline.syncing', { count: pending }) : t('offline.offline', { count: pending })
      }
    />
  );
};

export default OfflineBanner;
