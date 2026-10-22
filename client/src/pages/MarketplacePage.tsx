import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Drawer, Segmented } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAppSelector } from '../store/hooks';
import { useSavedGigs } from '../hooks/useSavedGigs';
import PageContainer from '../components/Layout/PageContainer';
import GigForm from '../components/Marketplace/GigForm';
import GigFeed from '../components/Marketplace/GigFeed';
import MatchList from '../components/Marketplace/MatchList';
import MyApplications from '../components/Marketplace/MyApplications';

type Tab = 'gigs' | 'saved' | 'applications' | 'matches';

const MarketplacePage = () => {
  const { t } = useTranslation();
  const role = useAppSelector((state) => state.auth.role);
  const { savedIds } = useSavedGigs();
  // The tab lives in the address (?tab=matches), not only in state: the
  // Dashboard can link straight to a tab, a refresh keeps it, and the browser's
  // back button from a receipt or a gig returns to the tab it was opened from.
  const [params, setParams] = useSearchParams();
  const allowed: Tab[] = role === 'worker' ? ['gigs', 'saved', 'applications', 'matches'] : ['gigs', 'matches'];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && allowed.includes(requested) ? requested : 'gigs';
  const setTab = (next: Tab) =>
    setParams(
      (prev) => {
        const q = new URLSearchParams(prev);
        if (next === 'gigs') q.delete('tab');
        else q.set('tab', next);
        // The match list's own filters belong to that tab only.
        if (next !== 'matches') ['status', 'sort', 'q'].forEach((k) => q.delete(k));
        return q;
      },
      // Switching tabs replaces the entry, so "back" still leaves the page in one step.
      { replace: true },
    );
  // Clients open the post form from the Dashboard with ?post=1.
  const wantsPost = params.get('post') === '1';
  const [postingGig, setPostingGig] = useState(wantsPost);

  const options = [
    {
      label: role === 'client' ? t('marketplace.tabs.yourGigs') : t('marketplace.tabs.openGigs'),
      value: 'gigs',
    },
    // Saving and applying are for workers finding work; a client sees their own gigs.
    ...(role === 'worker'
      ? [
          {
            label: (
              <span>
                {t('marketplace.tabs.saved')}
                {savedIds.length ? <Badge count={savedIds.length} size="small" offset={[6, -2]} /> : null}
              </span>
            ),
            value: 'saved',
          },
          { label: t('marketplace.tabs.myApplications'), value: 'applications' },
        ]
      : []),
    { label: t('marketplace.tabs.yourMatches'), value: 'matches' },
  ];

  return (
    <PageContainer
      title={t('sidebar.marketplace')}
      extra={
        role === 'client' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setPostingGig(true)}>
            {t('marketplace.postAGig')}
          </Button>
        )
      }
    >
      {/* A worker has four tabs, wider than a phone (390 px): the row scrolls on
          its own instead of pushing the whole page sideways. */}
      <div className="isoko-tabs-scroll" style={{ marginBottom: 20 }}>
        <Segmented value={tab} onChange={(v) => setTab(v as Tab)} options={options} />
      </div>

      {tab === 'gigs' && <GigFeed />}
      {tab === 'saved' && <GigFeed savedOnly />}
      {tab === 'applications' && <MyApplications />}
      {tab === 'matches' && <MatchList />}

      <Drawer
        title={t('marketplace.postAGig')}
        width={480}
        open={postingGig}
        onClose={() => setPostingGig(false)}
        destroyOnHidden
      >
        <GigForm onPosted={() => setPostingGig(false)} />
      </Drawer>
    </PageContainer>
  );
};

export default MarketplacePage;
