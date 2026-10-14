import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Tooltip } from 'antd';
import { MessageFilled } from '@ant-design/icons';
import { supportApi } from '../../api/supportApi';

/** The round button in the corner of the help centre: write to the team from anywhere in it. */
const ContactFab = ({ onClick }: { onClick: () => void }) => {
  const { t } = useTranslation();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    supportApi.unread().then(setUnread).catch(() => undefined);
  }, []);
  return (
    <Tooltip title={t('support.contactUs')} placement="left">
      <button type="button" className="isoko-hc-fab" onClick={onClick} aria-label={t('support.contactUs')}>
        <Badge count={unread} size="small" offset={[4, -4]}>
          <MessageFilled style={{ fontSize: 22, color: '#fff' }} />
        </Badge>
      </button>
    </Tooltip>
  );
};

export default ContactFab;
