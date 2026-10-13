import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  Empty,
  Flex,
  List,
  Progress,
  Rate,
  Result,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { userApi } from '../../api/userApi';
import { reviewApi } from '../../api/reviewApi';
import { useAppSelector } from '../../store/hooks';
import { canMessage } from '../../utils/messaging';
import PageContainer from '../Layout/PageContainer';
import Avatar from '../common/Avatar';
import IdentityLink from '../common/IdentityLink';
import TrustReceipt from '../common/TrustReceipt';
import type { PublicProfile, Review, UserSkill } from '../../types';
import WorkHistory from './WorkHistory';

const WorkerProfile = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role: viewerRole, profile: viewerProfile } = useAppSelector((state) => state.auth);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([userApi.getPublicProfile(id), userApi.getUserSkills(id), reviewApi.listReviews(id)])
      .then(([profileData, skillsData, reviewsData]) => {
        setProfile(profileData);
        setSkills(skillsData);
        setReviews(reviewsData);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Skeleton active avatar paragraph={{ rows: 6 }} />;
  if (notFound || !profile)
    return <Result status="404" title={t('common.profileNotFound')} />;

  const showMessageButton =
    viewerProfile && viewerProfile.id !== profile.id && canMessage(viewerRole, profile.role);

  const avgRating =
    reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <PageContainer
      title={profile.name}
      extra={
        showMessageButton && (
          <Button
            type="primary"
            icon={<MessageOutlined />}
            onClick={() =>
              navigate('/notifications', {
                state: { contact: { id: profile.id, name: profile.name } },
              })
            }
          >
            {t('profile.messageButton', { name: profile.name.split(' ')[0] })}
          </Button>
        )
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Flex vertical align="center" gap={12}>
              <Avatar name={profile.name} size={72} />
              <Typography.Title level={4} style={{ margin: 0 }}>
                {profile.name}
              </Typography.Title>
              <Tag>{t(`common.role.${profile.role}`)}</Tag>
              <Progress
                type="dashboard"
                size={120}
                percent={
                  profile.trustScoreBreakdown?.isProvisional
                    ? 0
                    : Math.round((profile.trustScore / 5) * 100)
                }
                format={() =>
                  profile.trustScoreBreakdown?.isProvisional ? (
                    // The long explanation lives in the breakdown below; inside
                    // the dial it would overflow the ring.
                    <span style={{ fontSize: 24, color: '#a1a1aa' }}>—</span>
                  ) : (
                    <span>
                      <span style={{ fontSize: 22, fontWeight: 700 }}>
                        {profile.trustScore.toFixed(1)}
                      </span>
                      <span style={{ fontSize: 12, color: '#71717a' }}> / 5</span>
                    </span>
                  )
                }
                strokeColor="#18181b"
              />
              <Typography.Text type="secondary">
                {profile.trustScoreBreakdown?.isProvisional
                  ? t('match.reason.trustProvisional')
                  : t('trust.title')}
              </Typography.Text>
            </Flex>
          </Card>

          {profile.trustScoreBreakdown && (
            <Card title={t('trust.viewBreakdown')} style={{ marginTop: 16 }}>
              <TrustReceipt breakdown={profile.trustScoreBreakdown} />
            </Card>
          )}
        </Col>

        <Col xs={24} md={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {profile.bio && (
              <Card title={t('profile.about')}>
                <Typography.Paragraph style={{ margin: 0 }}>{profile.bio}</Typography.Paragraph>
              </Card>
            )}

            {profile.role === 'worker' && (profile.experienceSummary || profile.yearsExperience) && (
              <Card title={t('experience.title')}>
                {profile.yearsExperience != null && (
                  <Tag style={{ marginBottom: profile.experienceSummary ? 10 : 0 }}>
                    {t('experience.yearsSuffix', { count: profile.yearsExperience })}
                  </Tag>
                )}
                {profile.experienceSummary && (
                  <Typography.Paragraph style={{ margin: 0 }}>
                    {profile.experienceSummary}
                  </Typography.Paragraph>
                )}
              </Card>
            )}

            {profile.role === 'worker' && (
              <Card title={t('profile.verifiedSkills')}>
                {skills.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t('profile.noVerifiedSkills')}
                  />
                ) : (
                  <Space size={[8, 8]} wrap>
                    {skills.map((us) => (
                      <Tag key={us.id} style={{ padding: '5px 12px', fontSize: 13, borderRadius: 4 }}>
                        {us.skill?.name}
                      </Tag>
                    ))}
                  </Space>
                )}
              </Card>
            )}

            {profile.role === 'worker' && <WorkHistory workerId={profile.id} />}

            <Card
              title={
                <Flex align="center" gap={8}>
                  <span>{t('profile.reviews', { count: reviews.length })}</span>
                  {reviews.length > 0 && <Rate disabled allowHalf value={avgRating} />}
                </Flex>
              }
            >
              {reviews.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('profile.noReviews')} />
              ) : (
                <List
                  dataSource={reviews}
                  renderItem={(review) => (
                    <List.Item>
                      {/* One identity per review: author and date on top, then the
                          rating and comment. */}
                      <div style={{ width: '100%' }}>
                        <Flex justify="space-between" align="center" gap={12}>
                          <div style={{ minWidth: 0 }}>
                            {review.author ? (
                              <IdentityLink id={review.author.id} name={review.author.name} size={28} />
                            ) : null}
                          </div>
                          <Typography.Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                            {new Date(review.createdAt).toLocaleDateString()}
                          </Typography.Text>
                        </Flex>
                        <div style={{ paddingInlineStart: 36, marginTop: 4 }}>
                          <Rate disabled value={review.rating} style={{ fontSize: 13 }} />
                          {review.comment && (
                            <Typography.Paragraph style={{ margin: '6px 0 0' }}>
                              {review.comment}
                            </Typography.Paragraph>
                          )}
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Space>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default WorkerProfile;
