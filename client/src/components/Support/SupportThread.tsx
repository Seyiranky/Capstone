import { useTranslation } from 'react-i18next';
import { Tooltip, Typography } from 'antd';
import { FileTextOutlined, LockOutlined, PaperClipOutlined } from '@ant-design/icons';
import Avatar from '../common/Avatar';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { fromNow } from '../../lib/time';
import type { SupportMessage } from '../../api/supportApi';
import logo from '../../assets/logo.png';

const TeamAvatar = ({ size = 32 }: { size?: number }) => (
  <span className="isoko-support-team-avatar" style={{ width: size, height: size }}>
    <img src={logo} alt="" />
  </span>
);

const Attachment = ({ m }: { m: SupportMessage }) => {
  const url = resolveAssetUrl(m.attachmentUrl);
  if (!url) return null;
  if (m.attachmentMime?.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="isoko-support-msg__image">
        <img src={url} alt={m.attachmentName ?? ''} />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="isoko-support-msg__file">
      <FileTextOutlined /> {m.attachmentName ?? 'attachment.pdf'}
    </a>
  );
};

/**
 * A support conversation. The requester's own messages sit on the right; the
 * team's on the left under "Isoko Support". Admins also see which admin wrote,
 * and internal notes on a yellow ground. System events are a centred line.
 */
const SupportThread = ({
  messages,
  viewer,
  requesterName,
}: {
  messages: SupportMessage[];
  viewer: 'requester' | 'admin';
  requesterName: string;
}) => {
  const { t } = useTranslation();
  return (
    <div className="isoko-support-thread">
      {messages.map((m) => {
        if (m.authorRole === 'system') {
          const by = viewer === 'admin' && m.meta?.by ? ` · ${m.meta.by}` : '';
          return (
            <div key={m.id} className={`isoko-support-event${m.internal ? ' isoko-support-event--internal' : ''}`}>
              {m.internal && <LockOutlined />}
              <span>
                {t(`support.system_${m.systemKey}`, { ...(m.meta ?? {}), defaultValue: m.systemKey ?? '' })}
                {by}
              </span>
              <Tooltip title={new Date(m.createdAt).toLocaleString()}>
                <span className="isoko-support-event__time">{fromNow(m.createdAt)}</span>
              </Tooltip>
            </div>
          );
        }
        const fromRequester = m.authorRole === 'user' || m.authorRole === 'guest';
        // The requester reads their own words on the right; an admin reads the team's on the right.
        const mine = viewer === 'requester' ? fromRequester : !fromRequester;
        const name = fromRequester
          ? viewer === 'requester'
            ? t('support.you')
            : requesterName
          : viewer === 'admin'
            ? `${m.author?.name ?? t('support.team')}`
            : t('support.team');
        return (
          <div
            key={m.id}
            className={`isoko-support-msg${mine ? ' isoko-support-msg--mine' : ''}${m.internal ? ' isoko-support-msg--internal' : ''}`}
          >
            {!mine &&
              (fromRequester ? (
                <Avatar name={requesterName} src={m.author?.avatarUrl} size={32} />
              ) : (
                <TeamAvatar />
              ))}
            <div className="isoko-support-msg__col">
              <div className="isoko-support-msg__meta">
                {m.internal && (
                  <span className="isoko-support-msg__note">
                    <LockOutlined /> Internal note
                  </span>
                )}
                <strong>{name}</strong>
                <Tooltip title={new Date(m.createdAt).toLocaleString()}>
                  <span>{fromNow(m.createdAt)}</span>
                </Tooltip>
              </div>
              <div className="isoko-support-msg__bubble">
                {m.body && <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.body}</Typography.Paragraph>}
                <Attachment m={m} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const AttachIcon = PaperClipOutlined;
export default SupportThread;
