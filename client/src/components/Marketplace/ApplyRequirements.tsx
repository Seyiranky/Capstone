import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CloseCircleFilled, SafetyOutlined } from '@ant-design/icons';
import type { IneligibleReason } from '../../api/gigApplicationApi';

/** Where each missing requirement is put right. */
const FIX: Partial<Record<IneligibleReason, string>> = {
  contact_unconfirmed: '/settings?tab=notifications',
  sensitive_phone: '/settings?tab=notifications',
  sensitive_skill: '/settings?tab=skills',
  sensitive_record: '/marketplace',
  open_report: '/support?new=1&category=account',
};

/**
 * Why a worker cannot apply yet, every reason at once, each with where to fix
 * it, so nobody is left guessing why the button is missing.
 */
const ApplyRequirements = ({ missing, sensitive }: { missing: IneligibleReason[]; sensitive: boolean }) => {
  const { t } = useTranslation();
  return (
    <div className="isoko-apply-req">
      <strong>
        <SafetyOutlined /> {sensitive ? t('applyRules.sensitiveTitle') : t('applyRules.title')}
      </strong>
      {sensitive && <p>{t('applyRules.sensitiveWhy')}</p>}
      <ul>
        {missing.map((m) => (
          <li key={m}>
            <CloseCircleFilled />
            <span>
              {t(`applyRules.${m}`)}
              {FIX[m] && (
                <>
                  {' '}
                  <Link to={FIX[m]!}>{t(`applyRules.fix_${m}`)}</Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ApplyRequirements;
