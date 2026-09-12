import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Card, Col, Divider, Flex, Result, Row, Skeleton, Space, Tag, Typography } from 'antd';
import { CheckCircleTwoTone, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { passportApi } from '../api/passportApi';
import Avatar from '../components/common/Avatar';
import TrustReceipt from '../components/common/TrustReceipt';
import LanguageToggle from '../components/common/LanguageToggle';
import type { PassportRead, PassportVerification } from '../types';

/**
 * A worker's verifiable credential, readable without an account.
 *
 * This is the portable record the problem statement calls for: a client can
 * scan it on the spot and confirm the claims against live data, instead of
 * taking a stranger's word or relying on a shared acquaintance.
 */
const PassportPage = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PassportRead | null>(null);
  const [check, setCheck] = useState<PassportVerification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    passportApi
      .read(token)
      .then((res) => {
        setData(res);
        return passportApi.verify(token).then(setCheck).catch(() => undefined);
      })
      .catch((err) => setData(err?.response?.data ?? { valid: false, reason: 'unknownPassport' }))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <Skeleton active avatar paragraph={{ rows: 8 }} style={{ padding: 24 }} />;

  if (!data?.valid || !data.claims) {
    const reason = data?.reason ?? 'unknownPassport';
    return (
      <Result
        status="warning"
        title={t(`passport.invalid.${reason}`, { defaultValue: t('passport.invalid.unknownPassport') })}
        subTitle={t('passport.invalidHelp')}
      />
    );
  }

  const { claims } = data;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Flex align="center" gap={8}>
          <SafetyCertificateOutlined style={{ fontSize: 20 }} />
          <Typography.Text strong>{t('passport.title')}</Typography.Text>
        </Flex>
        <LanguageToggle />
      </Flex>

      {check && (
        <Alert
          type={check.matches ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 16 }}
          message={check.matches ? t('passport.verifiedNow') : t('passport.recordChanged')}
          description={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('passport.checkedAt', {
                time: new Date(check.checkedAt ?? Date.now()).toLocaleString(),
              })}
            </Typography.Text>
          }
        />
      )}

      <Card>
        <Flex align="center" gap={16} wrap>
          <Avatar name={claims.name} size={64} />
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {claims.name}
            </Typography.Title>
            <Typography.Text type="secondary">
              {t('passport.memberSince', {
                date: new Date(claims.memberSince).toLocaleDateString(),
              })}
            </Typography.Text>
          </div>
        </Flex>

        <Divider style={{ margin: '16px 0' }} />

        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('passport.completedJobs')}
            </Typography.Text>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{claims.completedJobs}</div>
          </Col>
          <Col xs={12} sm={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('passport.reviews')}
            </Typography.Text>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{claims.reviewCount}</div>
          </Col>
          <Col xs={12} sm={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('trust.title')}
            </Typography.Text>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {claims.trustScoreBreakdown?.isProvisional
                ? '—'
                : claims.trustScore.toFixed(1)}
            </div>
          </Col>
        </Row>
      </Card>

      <Card title={t('passport.verifiedSkills')} style={{ marginTop: 16 }}>
        {claims.skills.length === 0 ? (
          <Typography.Text type="secondary">{t('profile.noVerifiedSkills')}</Typography.Text>
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {claims.skills.map((s) => (
              <Flex key={s.skill} justify="space-between" align="flex-start" gap={12} wrap>
                <Space direction="vertical" size={2}>
                  <Flex align="center" gap={8}>
                    <CheckCircleTwoTone twoToneColor="#16a34a" />
                    <Typography.Text strong>{s.skill}</Typography.Text>
                    <Tag style={{ margin: 0 }}>
                      {t('passport.level', { level: s.proficiencyLevel })}
                    </Tag>
                  </Flex>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {/* Count, never identity: naming reviewers would expose them. */}
                    {t('passport.approvals', { count: s.independentApprovals })}
                  </Typography.Text>
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(s.verifiedAt).toLocaleDateString()}
                </Typography.Text>
              </Flex>
            ))}
          </Space>
        )}
      </Card>

      {claims.trustScoreBreakdown && (
        <Card title={t('trust.viewBreakdown')} style={{ marginTop: 16 }}>
          <TrustReceipt breakdown={claims.trustScoreBreakdown} />
        </Card>
      )}

      <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 16 }}>
        {t('passport.footer')}
      </Typography.Paragraph>
    </div>
  );
};

export default PassportPage;
