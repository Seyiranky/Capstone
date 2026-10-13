import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Col,
  Empty,
  Flex,
  Grid,
  Input,
  Row,
  Segmented,
  Skeleton,
  Switch,
  Tooltip,
  Typography,
} from 'antd';
import { AppstoreOutlined, EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchGigs } from '../../store/slices/gigSlice';
import { useSavedGigs } from '../../hooks/useSavedGigs';
import { distanceKm } from '../../utils/distance';
import GigCard from './GigCard';
import MarketplaceMap from './MarketplaceMap';

const GigFeed = ({ savedOnly = false }: { savedOnly?: boolean }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { role, profile } = useAppSelector((state) => state.auth);
  const gigs = useAppSelector((state) => state.gigs.items);
  const status = useAppSelector((state) => state.gigs.status);
  const [nearMe, setNearMe] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [search, setSearch] = useState('');

  useEffect(() => {
    dispatch(fetchGigs());
  }, [dispatch]);

  const workerLat = role === 'worker' ? profile?.locationLat : null;
  const workerLng = role === 'worker' ? profile?.locationLng : null;
  const hasWorkerLocation = workerLat != null && workerLng != null;

  const { savedIds } = useSavedGigs();

  const base = useMemo(() => {
    if (savedOnly) return gigs.filter((g) => savedIds.includes(g.id));
    return role === 'client' && profile
      ? gigs.filter((g) => g.clientId === profile.id)
      : gigs.filter((g) => g.status === 'open');
  }, [gigs, role, profile, savedOnly, savedIds]);

  // Newest first; "Near me" orders by distance instead.
  const nearest = nearMe && hasWorkerLocation;

  const finalGigs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dist = (lat: number, lng: number) =>
      hasWorkerLocation ? distanceKm(workerLat!, workerLng!, lat, lng) : Number.POSITIVE_INFINITY;
    // Search covers the trade too, so "tailoring" finds tailoring gigs.
    const list = base.filter(
      (g) => !q || `${g.title} ${g.description} ${g.skill?.name ?? ''}`.toLowerCase().includes(q),
    );
    return [...list].sort((a, b) =>
      nearest
        ? dist(a.locationLat, a.locationLng) - dist(b.locationLat, b.locationLng)
        : (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    );
  }, [base, search, nearest, hasWorkerLocation, workerLat, workerLng]);

  // Phones: search takes its own row.
  const narrow = !Grid.useBreakpoint().sm;

  return (
    <div>
      <Flex wrap="wrap" gap={12} align="center" style={{ marginBottom: 18 }}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: 'var(--isoko-muted)' }} />}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: narrow ? '100%' : 320 }}
        />
        {role === 'worker' && (
          <Tooltip title={!hasWorkerLocation ? t('marketplace.gigFeed.setLocationHint') : undefined}>
            <Flex align="center" gap={8}>
              <Switch
                size="small"
                checked={nearMe}
                disabled={!hasWorkerLocation}
                onChange={setNearMe}
              />
              <Typography.Text type={hasWorkerLocation ? undefined : 'secondary'}>
                {t('marketplace.gigFeed.nearMe')}
              </Typography.Text>
            </Flex>
          </Tooltip>
        )}
        <Segmented
          value={view}
          onChange={(v) => setView(v as 'list' | 'map')}
          style={{ marginLeft: 'auto' }}
          options={[
            { value: 'list', icon: <AppstoreOutlined /> },
            { value: 'map', icon: <EnvironmentOutlined /> },
          ]}
        />
      </Flex>

      {status === 'loading' ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2, 3].map((i) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={i}>
              <Card cover={<div style={{ aspectRatio: '16 / 10', background: 'var(--ant-color-fill-secondary)' }} />}>
                <Skeleton active paragraph={{ rows: 2 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : finalGigs.length === 0 ? (
        <Card>
          <Empty
            description={
              savedOnly
                ? t('marketplace.gigFeed.emptySaved')
                : search
                  ? t('marketplace.gigFeed.emptyFiltered')
                  : t('marketplace.gigFeed.empty')
            }
          />
        </Card>
      ) : view === 'map' ? (
        <>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
            {t('marketplace.gigFeed.gigCountOnMap', { count: finalGigs.length })}
          </Typography.Text>
          <MarketplaceMap gigs={finalGigs} />
        </>
      ) : (
        <>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
            {t('marketplace.gigFeed.gigCount', { count: finalGigs.length })}
          </Typography.Text>
          <Row gutter={[16, 16]}>
            {finalGigs.map((gig) => (
              <Col xs={24} sm={12} lg={8} xl={6} key={gig.id}>
                <GigCard
                  gig={gig}
                  footNote={
                    nearest
                      ? t('marketplace.gigFeed.distanceAway', {
                          distance: distanceKm(
                            workerLat!,
                            workerLng!,
                            gig.locationLat,
                            gig.locationLng,
                          ).toFixed(1),
                        })
                      : undefined
                  }
                />
              </Col>
            ))}
          </Row>
        </>
      )}
    </div>
  );
};

export default GigFeed;
