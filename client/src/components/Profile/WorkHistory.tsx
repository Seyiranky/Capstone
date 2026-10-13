import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Empty, Flex, Image, Rate, Tag, Typography } from 'antd';
import { userApi } from '../../api/userApi';
import { resolveAssetUrl } from '../../utils/assetUrl';
import type { WorkHistoryEntry } from '../../types';

/**
 * A worker's paid jobs: what they did, how it was rated, and photos of it.
 * Each links to its public receipt, so the record can be checked.
 */
const WorkHistory = ({ workerId }: { workerId: string }) => {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<WorkHistoryEntry[] | null>(null);

  useEffect(() => {
    userApi
      .getWorkHistory(workerId)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [workerId]);

  if (!entries) return null;

  return (
    <Card title={`${t('workHistory.title')} (${entries.length})`}>
      {entries.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('workHistory.empty')} />
      ) : (
        <Flex vertical gap={0}>
          {entries.map((e, i) => (
            <div
              key={e.matchId}
              style={{
                padding: '12px 0',
                borderTop: i === 0 ? undefined : '1px solid var(--ant-color-border-secondary, #e4e4e7)',
              }}
            >
              <Flex justify="space-between" align="flex-start" gap={12} wrap="wrap">
                <div style={{ minWidth: 0 }}>
                  <Typography.Text strong style={{ display: 'block' }}>
                    {e.gig}
                  </Typography.Text>
                  <Flex gap={8} align="center" wrap="wrap" style={{ marginTop: 2 }}>
                    {e.skill && <Tag style={{ margin: 0 }}>{e.skill}</Tag>}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(e.completedAt).toLocaleDateString(i18n.resolvedLanguage, {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Typography.Text>
                    {e.receiptNumber && (
                      <Link to={`/r/${e.receiptNumber}`} style={{ fontSize: 12 }}>
                        {t('workHistory.receipt')}
                      </Link>
                    )}
                  </Flex>
                </div>
                {e.rating != null && <Rate disabled value={e.rating} style={{ fontSize: 13 }} />}
              </Flex>
              {e.comment && (
                <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13 }}>
                  “{e.comment}”
                </Typography.Paragraph>
              )}
              {e.photos.length > 0 && (
                <Flex gap={6} style={{ marginTop: 8 }}>
                  <Image.PreviewGroup>
                    {e.photos.map((p) => (
                      <Image
                        key={p.url}
                        src={resolveAssetUrl(p.url)}
                        width={72}
                        height={72}
                        style={{ objectFit: 'cover', borderRadius: 4 }}
                      />
                    ))}
                  </Image.PreviewGroup>
                </Flex>
              )}
            </div>
          ))}
        </Flex>
      )}
    </Card>
  );
};

export default WorkHistory;
