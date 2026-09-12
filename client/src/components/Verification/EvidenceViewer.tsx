import { Empty, Image, Space, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { resolveAssetUrl } from '../../utils/assetUrl';
import type { SkillTaskEvidence } from '../../types';

/**
 * Renders submitted evidence in place.
 *
 * A reviewer judging a photo should see the photo and a voice note should be
 * playable inline — asking them to open links in new tabs is how rubber-stamping
 * starts, and the audit flags fast approvals.
 */
const EvidenceViewer = ({ evidence }: { evidence?: SkillTaskEvidence[] }) => {
  const { t } = useTranslation();

  if (!evidence || evidence.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('verification.noEvidence')} />;
  }

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      {evidence.map((item) => {
        const src = resolveAssetUrl(item.url);
        return (
          <div key={item.id}>
            <Tag style={{ marginBottom: 6 }}>{t(`verification.kind.${item.kind}`, item.kind)}</Tag>
            {item.kind === 'photo' && (
              <Image src={src} alt="" style={{ maxHeight: 220, borderRadius: 6 }} />
            )}
            {item.kind === 'video' && (
              <video src={src} controls style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 6 }} />
            )}
            {item.kind === 'voice' && (
              <audio src={src} controls style={{ width: '100%', maxWidth: 320 }} />
            )}
            {item.kind === 'link' && (
              <div>
                <a href={src} target="_blank" rel="noreferrer">
                  {item.url}
                </a>
              </div>
            )}
          </div>
        );
      })}
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        {t('verification.evidenceFingerprint')}
      </Typography.Text>
    </Space>
  );
};

export default EvidenceViewer;
