import { useState } from 'react';
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
  const [tab, setTab] = useState<Tab>('gigs');
  const [postingGig, setPostingGig] = useState(false);

  const options = [
    { label: role === 'client' ? 'Your gigs' : 'Open gigs', value: 'gigs' },
    {
      label: (
        <span>
          Saved{savedIds.length ? <Badge count={savedIds.length} size="small" offset={[6, -2]} /> : null}
        </span>
      ),
      value: 'saved',
    },
    ...(role === 'worker' ? [{ label: 'My applications', value: 'applications' }] : []),
    { label: 'Your matches', value: 'matches' },
  ];

  return (
    <PageContainer
      title={t('sidebar.marketplace')}
      extra={
        role === 'client' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setPostingGig(true)}>
            Post a gig
          </Button>
        )
      }
    >
      <Segmented
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        style={{ marginBottom: 20 }}
        options={options}
      />

      {tab === 'gigs' && <GigFeed />}
      {tab === 'saved' && <GigFeed savedOnly />}
      {tab === 'applications' && <MyApplications />}
      {tab === 'matches' && <MatchList />}

      <Drawer
        title="Post a gig"
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
