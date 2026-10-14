import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QuestionCircleOutlined } from '@ant-design/icons';
import type { SupportCategory, SupportRelatedType } from '../../api/supportApi';

/**
 * "Need help?" where people get stuck: opens the contact form with the topic
 * and the job or payment already filled in, and the page it came from noted.
 */
const HelpLink = ({
  category,
  relatedType,
  relatedId,
  label,
}: {
  category: SupportCategory;
  relatedType?: SupportRelatedType;
  relatedId?: string;
  label?: string;
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const params = new URLSearchParams({ new: '1', category, from: location.pathname });
  if (relatedType && relatedId) {
    params.set('type', relatedType);
    params.set('id', relatedId);
  }
  return (
    <Link to={`/support?${params}`} className="isoko-help-link">
      <QuestionCircleOutlined /> {label ?? t('support.needHelp')}
    </Link>
  );
};

export default HelpLink;
