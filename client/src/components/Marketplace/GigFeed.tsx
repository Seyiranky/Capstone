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
  Select,
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

type SortKey = 'newest' | 'budget_desc' | 'budget_asc' | 'nearest';

const GigFeed = ({ savedOnly = false }: { savedOnly?: boolean }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { role, profile } = useAppSelector((state) => state.auth);
  const gigs = useAppSelector((state) => state.gigs.items);
  const status = useAppSelector((state) => state.gigs.status);
  const [nearMe, setNearMe] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('newest');

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

  const categories = useMemo(() => {
    const set = new Map<string, string>();
    for (const g of base) if (g.skill?.name) set.set(g.skill.name, g.skill.name);
    return [...set.keys()].sort();
  }, [base]);

  const effectiveSort: SortKey = nearMe && hasWorkerLocation ? 'nearest' : sort;

  const finalGigs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dist = (lat: number, lng: number) =>
      hasWorkerLocation ? distanceKm(workerLat!, workerLng!, lat, lng) : Number.POSITIVE_INFINITY;
    const list = base.filter((g) => {
      if (category !== 'all' && g.skill?.name !== category) return false;
      if (q && !`${g.title} ${g.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (effectiveSort === 'budget_desc') return Number(b.budget) - Number(a.budget);
      if (effectiveSort === 'budget_asc') return Number(a.budget) - Number(b.budget);
      if (effectiveSort === 'nearest')
        return dist(a.locationLat, a.locationLng) - dist(b.locationLat, b.locationLng);
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
  }, [base, search, category, effectiveSort, hasWorkerLocation, workerLat, workerLng]);

  // Phones: search takes its own row and the two selects split the next one.
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
          style={{ width: narrow ? '100%' : 240 }}
        />
        <Select
          value={category}
          onChange={setCategory}
          style={{ width: narrow ? 'calc(50% - 6px)' : 200 }}
          options={[
            { value: 'all', label: t('marketplace.gigFeed.allCategories') },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />
        <Select
          value={sort}
          onChange={setSort}
          style={{ width: narrow ? 'calc(50% - 6px)' : 180 }}
          options={[
            { value: 'newest', label: t('marketplace.gigFeed.sortNewest') },
            { value: 'budget_desc', label: t('marketplace.gigFeed.sortBudgetDesc') },
            { value: 'budget_asc', label: t('marketplace.gigFeed.sortBudgetAsc') },
            ...(hasWorkerLocation ? [{ value: 'nearest', label: t('marketplace.gigFeed.sortNearest') }] : []),
          ]}
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
                : search || category !== 'all'
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
                    effectiveSort === 'nearest'
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
