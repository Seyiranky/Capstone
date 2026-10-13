import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography } from 'antd';
import type { GigApplication } from '../../types';

/**
 * Why an application was turned down, and, for a skill gap, the way to close it:
 * the Dashboard's "add a skill" flow, opened straight from here.
 */
const RejectionNotice = ({ application }: { application: GigApplication }) => {
  const { t } = useTranslation();
  if (application.status !== 'rejected' || !application.rejectionReason) return null;
  return (
    <Typography.Text
      type="secondary"
      style={{ fontSize: 12, display: 'block', marginTop: 4, maxWidth: 260, whiteSpace: 'normal' }}
    >
      {t(`rejection.${application.rejectionReason}`)}
      {application.rejectionNote ? ` · “${application.rejectionNote}”` : ''}
      {application.rejectionReason === 'skillLevel' && (
        <>
          {' · '}
          <Link to="/dashboard" state={{ openAddSkill: true }}>
            {t('rejection.nextStep')}
          </Link>
        </>
      )}
    </Typography.Text>
  );
};

export default RejectionNotice;
