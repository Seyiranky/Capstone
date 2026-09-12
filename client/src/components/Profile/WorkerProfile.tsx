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
import { userApi } from '../../api/userApi';
import { reviewApi } from '../../api/reviewApi';
import { useAppSelector } from '../../store/hooks';
import { canMessage } from '../../utils/messaging';
import PageContainer from '../Layout/PageContainer';
import Avatar from '../common/Avatar';
import IdentityLink from '../common/IdentityLink';
import type { PublicProfile, Review, UserSkill } from '../../types';

const WorkerProfile = () => {
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
    return <Result status="404" title="This profile could not be found." />;

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
            Message {profile.name.split(' ')[0]}
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
              <Tag style={{ textTransform: 'capitalize' }}>{profile.role}</Tag>
              <Progress
                type="dashboard"
                size={120}
                percent={Math.round((profile.trustScore / 5) * 100)}
                format={() => (
                  <span>
                    <span style={{ fontSize: 22, fontWeight: 700 }}>
                      {profile.trustScore.toFixed(1)}
                    </span>
                    <span style={{ fontSize: 12, color: '#71717a' }}> / 5</span>
                  </span>
                )}
                strokeColor="#18181b"
              />
              <Typography.Text type="secondary">Trust score</Typography.Text>
            </Flex>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {profile.bio && (
              <Card title="About">
                <Typography.Paragraph style={{ margin: 0 }}>{profile.bio}</Typography.Paragraph>
              </Card>
            )}

            {profile.role === 'worker' && (
              <Card title="Verified skills">
                {skills.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No verified skills yet."
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

            <Card
              title={
                <Flex align="center" gap={8}>
                  <span>Reviews ({reviews.length})</span>
                  {reviews.length > 0 && <Rate disabled allowHalf value={avgRating} />}
                </Flex>
              }
            >
              {reviews.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No reviews yet." />
              ) : (
                <List
                  dataSource={reviews}
                  renderItem={(review) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          review.author ? (
                            <Avatar name={review.author.name} size={32} />
                          ) : undefined
                        }
                        title={
                          <Flex justify="space-between">
                            <Rate disabled value={review.rating} style={{ fontSize: 14 }} />
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {new Date(review.createdAt).toLocaleDateString()}
                            </Typography.Text>
                          </Flex>
                        }
                        description={
                          <>
                            {review.comment && (
                              <Typography.Paragraph style={{ marginBottom: 4 }}>
                                {review.comment}
                              </Typography.Paragraph>
                            )}
                            {review.author && (
                              <IdentityLink
                                id={review.author.id}
                                name={review.author.name}
                                size={20}
                              />
                            )}
                          </>
                        }
                      />
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
