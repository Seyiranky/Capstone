import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Card, Flex, Popconfirm, Typography } from 'antd';
import { ClockCircleOutlined, LikeOutlined, LinkOutlined, MessageOutlined } from '@ant-design/icons';
import SupportThread from './SupportThread';
import SupportComposer from './SupportComposer';
import { CategoryIcon, StatusPill } from './supportUi';
import type { SupportTicketDetail } from '../../api/supportApi';

/** A request as the person who made it sees it: the thread, a reply box, and closing or rating it. */
const RequesterTicketView = ({
  ticket,
  requesterName,
  onReply,
  onClose,
  onRate,
}: {
  ticket: SupportTicketDetail;
  requesterName: string;
  onReply: (body: string, file: File | null) => Promise<unknown>;
  onClose?: () => Promise<unknown>;
  onRate?: (helpful: boolean) => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const relatedLink =
    ticket.related?.gigId ? `/gigs/${ticket.related.gigId}` : ticket.related?.type === 'skill_task' ? '/settings' : null;

  return (
    <Card styles={{ body: { padding: 0 } }} className="isoko-support-card">
      <div className="isoko-support-head">
        <Flex gap={12} align="flex-start">
          <CategoryIcon category={ticket.category} size={40} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {ticket.subject}
            </Typography.Title>
            <div className="isoko-support-head__meta">
              <span>{t(`support.cat_${ticket.category}`)}</span>
                            <span>
                {t('support.reference')} <strong>{ticket.number}</strong>
              </span>
                            <span>{t('support.opened', { date: new Date(ticket.createdAt).toLocaleDateString() })}</span>
            </div>
          </div>
          <StatusPill status={ticket.status} />
        </Flex>
        {ticket.related && (
          <div className="isoko-support-related">
            <LinkOutlined />
            <span className="isoko-support-related__text">
              {t('support.about')}: <strong>{ticket.related.title}</strong>
              {ticket.related.detail ? ` · ${ticket.related.detail}` : ''}
            </span>
            {relatedLink && <Link to={relatedLink}>{t('support.openItem')}</Link>}
          </div>
        )}
      </div>

      <div className="isoko-support-body">
        {ticket.status === 'waiting_on_user' && (
          <div className="isoko-support-hint isoko-support-hint--waiting">
            <MessageOutlined /> {t('support.waitingHint')}
          </div>
        )}
        {ticket.status === 'open' && (
          <div className="isoko-support-hint">
            <ClockCircleOutlined /> {t('support.openHint')}
          </div>
        )}
        <SupportThread messages={ticket.messages} viewer="requester" requesterName={requesterName} />

        {ticket.status === 'resolved' && onRate && ticket.helpful === null && (
          <div className="isoko-support-rate">
            <Typography.Text strong>{t('support.rateTitle')}</Typography.Text>
            <Flex gap={8} wrap="wrap">
              <Button icon={<LikeOutlined />} onClick={() => onRate(true)}>{t('support.rateYes')}</Button>
              <Button onClick={() => onRate(false)}>{t('support.rateNo')}</Button>
            </Flex>
          </div>
        )}
        {ticket.helpful === true && (
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 12 }}>
            {t('support.ratedYes')}
          </Typography.Text>
        )}
      </div>

      {ticket.status === 'closed' ? (
        <div className="isoko-support-foot">
          <Typography.Text type="secondary">{t('support.closedNote')}</Typography.Text>
        </div>
      ) : (
        <div className="isoko-support-foot">
          <SupportComposer placeholder={t('support.replyPlaceholder')} onSend={onReply} />
          {onClose && (
            <Flex justify="flex-end" style={{ marginTop: 8 }}>
              <Popconfirm title={t('support.closeConfirm')} onConfirm={() => onClose()} okText={t('support.closeRequest')} cancelText={t('common.cancel')}>
                <Button type="link" size="small" style={{ color: 'var(--isoko-muted)' }}>
                  {t('support.closeRequest')}
                </Button>
              </Popconfirm>
            </Flex>
          )}
        </div>
      )}
    </Card>
  );
};

export default RequesterTicketView;
