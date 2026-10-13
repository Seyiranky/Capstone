import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Col, Flex, Input, Row, Typography } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import { ussdApi } from '../../api/ussdApi';
import { apiErrorMessage } from '../../utils/apiError';

export const USSD_CODE = '*500*1#';

/**
 * A basic phone on screen, running the same USSD menus a worker reaches by
 * dialling from any handset. The session is the chain of choices joined by
 * "*", exactly what the gateway sends; END closes it.
 */
const UssdPage = () => {
  const { t } = useTranslation();
  const [session, setSession] = useState<string[] | null>(null);
  const [screen, setScreen] = useState('');
  const [ended, setEnded] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (choices: string[]) => {
    setBusy(true);
    try {
      const reply = await ussdApi.simulate(choices.join('*'));
      setEnded(reply.startsWith('END'));
      setScreen(reply.replace(/^(CON|END) /, ''));
      setSession(choices);
    } catch (err) {
      setEnded(true);
      setScreen(apiErrorMessage(err, t('ussd.failed')));
    } finally {
      setBusy(false);
      setInput('');
    }
  };

  const dial = () => send([]);
  const reply = () => input.trim() && session && send([...session, input.trim()]);
  const hangUp = () => {
    setSession(null);
    setScreen('');
    setEnded(false);
  };

  return (
    <PageContainer title={t('ussd.title')} subtitle={t('ussd.subtitle')}>
      <Row gutter={[24, 24]}>
        <Col xs={24} md={10} lg={8}>
          <div
            style={{
              maxWidth: 300,
              margin: '0 auto',
              padding: '28px 18px 22px',
              borderRadius: 28,
              background: '#1c1c1f',
              boxShadow: 'inset 0 0 0 2px #2e2e33',
            }}
          >
            <div
              aria-live="polite"
              style={{
                minHeight: 210,
                padding: 12,
                borderRadius: 6,
                background: '#c9d3b5',
                color: '#1a2310',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 13.5,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
              }}
            >
              {session === null ? t('ussd.idle', { code: USSD_CODE }) : busy ? t('ussd.loading') : screen}
            </div>
            <div style={{ marginTop: 14 }}>
              {session === null ? (
                <Button block icon={<PhoneOutlined />} onClick={dial} loading={busy}>
                  {t('ussd.dial', { code: USSD_CODE })}
                </Button>
              ) : ended ? (
                <Button block onClick={hangUp}>
                  {t('ussd.ok')}
                </Button>
              ) : (
                <Flex vertical gap={8}>
                  <Input
                    autoFocus
                    inputMode="numeric"
                    value={input}
                    maxLength={8}
                    onChange={(e) => setInput(e.target.value.replace(/[^0-9*#]/g, ''))}
                    onPressEnter={reply}
                    placeholder={t('ussd.reply')}
                  />
                  <Flex gap={8}>
                    <Button block onClick={hangUp}>
                      {t('ussd.cancel')}
                    </Button>
                    <Button block type="primary" onClick={reply} loading={busy}>
                      {t('ussd.send')}
                    </Button>
                  </Flex>
                </Flex>
              )}
            </div>
          </div>
        </Col>
        <Col xs={24} md={14} lg={16}>
          <Card title={t('ussd.howTitle')}>
            <Typography.Paragraph>{t('ussd.how1', { code: USSD_CODE })}</Typography.Paragraph>
            <Typography.Paragraph>{t('ussd.how2')}</Typography.Paragraph>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('ussd.how3')}
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default UssdPage;
