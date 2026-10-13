import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Col, Row, Typography } from 'antd';
import PollCard from './PollCard';
import { workerVoiceApi, type VoicePoll } from '../../api/workerVoiceApi';

/** Public record of what workers voted for and what the platform did. */
const VoiceResults = () => {
  const { t } = useTranslation();
  const [polls, setPolls] = useState<VoicePoll[]>([]);
  useEffect(() => {
    workerVoiceApi.list().then(setPolls).catch(() => setPolls([]));
  }, []);
  if (!polls.length) return null;
  return (
    <section style={{ marginTop: 32 }}>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        {t('workerVoice.publicTitle')}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 720 }}>
        {t('workerVoice.publicSub')}
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        {polls.slice(0, 4).map((p) => (
          <Col key={p.id} xs={24} md={12}>
            <PollCard poll={{ ...p, canVote: false }} />
          </Col>
        ))}
      </Row>
    </section>
  );
};

export default VoiceResults;
