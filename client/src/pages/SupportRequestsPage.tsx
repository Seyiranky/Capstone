import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Empty, Skeleton } from 'antd';
import { PlusOutlined, RightOutlined } from '@ant-design/icons';
import ContactFab from '../components/Support/ContactFab';
import { CategoryIcon, StatusPill } from '../components/Support/supportUi';
import { useContactSupport } from '../components/Support/useContactSupport';
import { supportApi, type SupportTicket } from '../api/supportApi';
import { fromNow } from '../lib/time';

/** The person's conversations with the team, newest activity first. */
const SupportRequestsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const contact = useContactSupport();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);

  useEffect(() => {
    supportApi.list().then(setTickets).catch(() => setTickets([]));
  }, []);

  return (
    <div className="isoko-hc isoko-hc--narrow">
      <nav className="isoko-hc-crumbs" aria-label="breadcrumb">
        <Link to="/support">{t('support.allTopics')}</Link>
        <RightOutlined />
        <span>{t('support.myRequests')}</span>
      </nav>
      <header className="isoko-hc-requests-head">
        <h1 className="isoko-hc-title isoko-hc-title--sm">{t('support.myRequests')}</h1>
        <button type="button" className="isoko-hc-button" onClick={() => contact.open()}>
          <PlusOutlined /> {t('support.newRequest')}
        </button>
      </header>

      {!tickets ? (
        <Skeleton active />
      ) : tickets.length === 0 ? (
        <div className="isoko-hc-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('support.noRequests')} />
        </div>
      ) : (
        <div className="isoko-hc-list">
          {tickets.map((tk) => (
            <button key={tk.id} type="button" className="isoko-hc-list__item" onClick={() => navigate(`/support/${tk.id}`)}>
              <CategoryIcon category={tk.category} size={34} />
              <span>
                <strong>
                  {tk.userUnread && <span className="isoko-ticket-row__dot" aria-label={t('support.newReply')} />}
                  {tk.subject}
                </strong>
                <span>
                  {tk.number} · {t('support.lastUpdate', { time: fromNow(tk.lastMessageAt) })}
                </span>
              </span>
              <StatusPill status={tk.status} />
            </button>
          ))}
        </div>
      )}

      <ContactFab onClick={() => contact.open()} />
      {contact.modal}
    </div>
  );
};

export default SupportRequestsPage;
