import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Empty, Flex, Skeleton } from 'antd';
import PageContainer from '../Layout/PageContainer';
import PollCard from './PollCard';
import { workerVoiceApi, type VoicePoll } from '../../api/workerVoiceApi';

/** Workers' page: polls on platform rules, open ones first, with the platform's answers. */
const WorkerVoicePage = () => {
  const { t } = useTranslation();
  const [polls, setPolls] = useState<VoicePoll[] | null>(null);
  const load = () => workerVoiceApi.list().then(setPolls);
  useEffect(() => {
    load();
  }, []);

  const order = { voting: 0, awaiting_response: 1, closed: 2 } as const;
  const sorted = polls ? [...polls].sort((a, b) => order[a.phase] - order[b.phase]) : null;
  const blocked = polls?.some((p) => p.phase === 'voting' && p.myVote === null && !p.canVote);

  return (
    <PageContainer title={t('workerVoice.title')} subtitle={t('workerVoice.subtitle')}>
      {blocked && <Alert type="info" showIcon message={t('workerVoice.notYet')} style={{ marginBottom: 16 }} />}
      {!sorted ? (
        <Skeleton active />
      ) : sorted.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('workerVoice.none')} />
      ) : (
        <Flex vertical gap={16} style={{ maxWidth: 760 }}>
          {sorted.map((p) => (
            <PollCard key={p.id} poll={p} onChange={load} />
          ))}
        </Flex>
      )}
    </PageContainer>
  );
};

export default WorkerVoicePage;
