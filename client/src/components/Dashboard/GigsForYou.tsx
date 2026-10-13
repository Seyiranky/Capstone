import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Empty, Flex, Typography } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { gigApi } from '../../api/gigApi';
import GigThumbnail from '../common/GigThumbnail';
import { locationName } from '../../utils/locationName';
import type { Gig, SkillCategory } from '../../types';

/** Open gigs in the worker's trades they have not already been matched to. */
const GigsForYou = ({ categories, exclude }: { categories: SkillCategory[]; exclude: string[] }) => {
  const { t } = useTranslation();
  const [gigs, setGigs] = useState<Gig[] | null>(null);

  useEffect(() => {
    gigApi
      .listGigs({ status: 'open' })
      .then(setGigs)
      .catch(() => setGigs([]));
  }, []);

  const shown = (gigs ?? [])
    .filter((g) => !exclude.includes(g.id))
    .filter((g) => categories.length === 0 || (g.skill && categories.includes(g.skill.category)))
    .slice(0, 4);

  return (
    <Card
      title={t('dashboard.gigsForYou')}
      extra={<Link to="/marketplace">{t('dashboard.seeAll')}</Link>}
      styles={{ body: { paddingBlock: shown.length ? 4 : 20 } }}
      loading={!gigs}
    >
      {shown.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.noGigsForYou')} />
      ) : (
        shown.map((g, i) => (
          <Link
            key={g.id}
            to={`/gigs/${g.id}`}
            style={{
              display: 'block',
              color: 'inherit',
              padding: '12px 0',
              borderTop: i === 0 ? undefined : '1px solid var(--isoko-border)',
            }}
          >
            <Flex gap={12} align="center">
              <GigThumbnail gig={g} size={44} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Typography.Text strong ellipsis style={{ display: 'block' }}>
                  {g.title}
                </Typography.Text>
                <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>
                  {g.skill?.name}
                  {locationName(g.locationLat, g.locationLng) && (
                    <>
                      {' · '}
                      <EnvironmentOutlined /> {locationName(g.locationLat, g.locationLng)}
                    </>
                  )}
                </Typography.Text>
              </div>
              <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
                {Number(g.budget).toLocaleString()} <span style={{ fontWeight: 400, color: 'var(--isoko-muted)', fontSize: 12 }}>RWF</span>
              </Typography.Text>
            </Flex>
          </Link>
        ))
      )}
    </Card>
  );
};

export default GigsForYou;
