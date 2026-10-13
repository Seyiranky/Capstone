import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { App, Col, Empty, Flex, Input, Modal, Radio, Row, Select, Skeleton, Space, Switch, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import WorkerCard from './WorkerCard';
import { directoryApi, type DirectoryQuery, type DirectoryWorker } from '../../api/directoryApi';
import { gigApi } from '../../api/gigApi';
import { skillApi } from '../../api/skillApi';
import { useAppSelector } from '../../store/hooks';
import { KIGALI_LOCATIONS } from '../../constants/locations';
import { apiErrorMessage } from '../../utils/apiError';
import type { Gig, Skill } from '../../types';

/** Areas as the directory names them: the short form of each Kigali location. */
const AREAS = KIGALI_LOCATIONS.map((l) => l.name.replace(/ \(.*\)$/, ''));

/**
 * The worker directory, for clients who would rather choose than wait.
 * Filters are the questions a client asks: what trade, where, proven or not,
 * free now. Each worker can be messaged or offered one of the client's open gigs.
 */
const FindWorkersPage = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const role = useAppSelector((s) => s.auth.role);
  const myId = useAppSelector((s) => s.auth.profile?.id);
  const [query, setQuery] = useState<DirectoryQuery>({ sort: 'trust', available: true });
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<{ total: number; workers: DirectoryWorker[] } | null>(null);
  const [trades, setTrades] = useState<Skill[]>([]);
  const [myGigs, setMyGigs] = useState<Gig[]>([]);
  const [offering, setOffering] = useState<DirectoryWorker | null>(null);
  const [gigId, setGigId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    skillApi.listSkills().then((all) => setTrades(all.filter((s) => !s.parentId)));
    if (role === 'client') {
      gigApi.listGigs({ status: 'open' }).then((all) => setMyGigs(all.filter((g) => g.clientId === myId)));
    }
  }, [role, myId]);

  // Typing waits for a pause before searching.
  useEffect(() => {
    const id = window.setTimeout(() => setQuery((q) => ({ ...q, q: search.trim() || undefined })), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let live = true;
    setResult(null);
    directoryApi.list(query).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [query]);

  const tradeOptions = useMemo(
    () => [{ value: '', label: t('workers.allTrades') }, ...trades.map((s) => ({ value: s.category, label: s.name }))],
    [trades, t],
  );

  const offer = async () => {
    if (!offering || !gigId) return;
    setBusy(true);
    try {
      await directoryApi.invite(gigId, offering.id);
      message.success(t('workers.offered', { name: offering.name }));
      setOffering(null);
      setGigId(null);
    } catch (err) {
      message.error(apiErrorMessage(err, t('workers.offerFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer title={t('workers.title')} subtitle={t('workers.subtitle')}>
      <Flex wrap="wrap" gap={10} align="center" style={{ marginBottom: 12 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('workers.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 240px', maxWidth: 360 }}
        />
        <Select
          value={query.category ?? ''}
          options={tradeOptions}
          onChange={(v) => setQuery((q) => ({ ...q, category: v || undefined }))}
          style={{ flex: '1 1 180px', maxWidth: 240 }}
        />
        <Select
          value={query.area ?? ''}
          options={[{ value: '', label: t('workers.anyArea') }, ...AREAS.map((a) => ({ value: a, label: a }))]}
          onChange={(v) => setQuery((q) => ({ ...q, area: v || undefined }))}
          style={{ flex: '1 1 160px', maxWidth: 200 }}
        />
        <Select
          value={query.sort}
          options={(['trust', 'jobs', 'newest'] as const).map((s) => ({ value: s, label: t(`workers.sort_${s}`) }))}
          onChange={(v) => setQuery((q) => ({ ...q, sort: v }))}
          style={{ flex: '0 1 170px' }}
        />
      </Flex>
      <Flex wrap="wrap" gap={20} align="center" style={{ marginBottom: 16 }}>
        <Space size={8}>
          <Switch size="small" checked={!!query.proven} onChange={(v) => setQuery((q) => ({ ...q, proven: v || undefined }))} />
          <Typography.Text style={{ fontSize: 13 }}>{t('workers.provenOnly')}</Typography.Text>
        </Space>
        <Space size={8}>
          <Switch size="small" checked={!!query.available} onChange={(v) => setQuery((q) => ({ ...q, available: v || undefined }))} />
          <Typography.Text style={{ fontSize: 13 }}>{t('workers.availableOnly')}</Typography.Text>
        </Space>
        {result && (
          <Typography.Text type="secondary" style={{ fontSize: 13, marginLeft: 'auto' }}>
            {t('workers.count', { count: result.total })}
          </Typography.Text>
        )}
      </Flex>

      {!result ? (
        <Skeleton active />
      ) : result.workers.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('workers.none')} />
      ) : (
        <Row gutter={[16, 16]}>
          {result.workers.map((w) => (
            <Col key={w.id} xs={24} md={12} xl={8}>
              <WorkerCard worker={w} onOffer={role === 'client' ? setOffering : undefined} />
            </Col>
          ))}
        </Row>
      )}

      <Modal
        open={Boolean(offering)}
        title={t('workers.offerTitle', { name: offering?.name ?? '' })}
        okText={t('workers.sendOffer')}
        okButtonProps={{ disabled: !gigId }}
        confirmLoading={busy}
        onOk={offer}
        onCancel={() => setOffering(null)}
        destroyOnHidden
      >
        {myGigs.length === 0 ? (
          <Typography.Paragraph>
            {t('workers.noOpenGigs')} <Link to="/marketplace">{t('workers.postFirst')}</Link>
          </Typography.Paragraph>
        ) : (
          <>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
              {t('workers.offerIntro', { name: offering?.name.split(' ')[0] ?? '' })}
            </Typography.Paragraph>
            <Radio.Group value={gigId} onChange={(e) => setGigId(e.target.value)}>
              <Space direction="vertical">
                {myGigs.map((g) => (
                  <Radio key={g.id} value={g.id}>
                    {g.title} · {Number(g.budget).toLocaleString()} RWF
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </>
        )}
      </Modal>
    </PageContainer>
  );
};

export default FindWorkersPage;
