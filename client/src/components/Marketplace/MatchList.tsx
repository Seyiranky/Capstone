import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  Modal,
  Rate,
  Row,
  Space,
  Typography,
} from 'antd';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchMatches } from '../../store/slices/matchSlice';
import { matchApi } from '../../api/matchApi';
import { transactionApi } from '../../api/transactionApi';
import { reviewApi } from '../../api/reviewApi';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import type { Match, MatchStatus } from '../../types';

const ReviewModal = ({
  match,
  onClose,
  onSubmitted,
}: {
  match: Match;
  onClose: () => void;
  onSubmitted: () => void;
}) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await reviewApi.createReview({ matchId: match.id, rating, comment: comment || undefined });
      onSubmitted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={`Review “${match.gig?.title ?? 'gig'}”`}
      okText="Leave review"
      confirmLoading={submitting}
      onOk={handleSubmit}
      onCancel={onClose}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Typography.Text type="secondary">Rating</Typography.Text>
          <br />
          <Rate value={rating} onChange={setRating} />
        </div>
        <div>
          <Typography.Text type="secondary">Comment (optional)</Typography.Text>
          <Input.TextArea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </Space>
    </Modal>
  );
};

const MatchList = () => {
  const dispatch = useAppDispatch();
  const { profile } = useAppSelector((state) => state.auth);
  const matches = useAppSelector((state) => state.matches.items);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewMatch, setReviewMatch] = useState<Match | null>(null);

  useEffect(() => {
    dispatch(fetchMatches());
  }, [dispatch]);

  const refresh = () => dispatch(fetchMatches());

  const transition = async (matchId: string, status: MatchStatus) => {
    setBusyId(matchId);
    try {
      await matchApi.updateMatchStatus(matchId, status);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const confirmPayment = async (transactionId: string) => {
    setBusyId(transactionId);
    try {
      await transactionApi.confirmTransaction(transactionId);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (!profile) return null;
  const isWorker = profile.role === 'worker';

  if (matches.length === 0) {
    return (
      <Card>
        <Empty description="No matches yet — post or get matched to a gig first." />
      </Card>
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        {matches.map((match) => {
          const alreadyReviewed = match.reviews?.some((r) => r.authorId === profile.id);
          const counterparty = isWorker ? match.gig?.client : match.worker;
          return (
            <Col xs={24} sm={12} lg={8} key={match.id}>
              <Card style={{ height: '100%' }}>
                <Flex justify="space-between" align="flex-start" gap={8}>
                  <Link to={`/gigs/${match.gigId}`} style={{ fontWeight: 600 }}>
                    {match.gig?.title ?? 'Gig'}
                  </Link>
                  <StatusTag status={match.status} />
                </Flex>
                <div style={{ margin: '10px 0' }}>
                  {counterparty ? (
                    <IdentityLink id={counterparty.id} name={counterparty.name} size={24} />
                  ) : (
                    <Typography.Text type="secondary">Unknown counterparty</Typography.Text>
                  )}
                </div>

                {match.status === 'accepted' && (
                  <Button
                    type="primary"
                    block
                    loading={busyId === match.id}
                    onClick={() => transition(match.id, 'completed')}
                  >
                    Mark completed
                  </Button>
                )}

                {match.status === 'completed' && match.transaction && (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Typography.Text type="secondary">
                      Payment ({match.transaction.provider}):{' '}
                      <StatusTag status={match.transaction.status} />
                    </Typography.Text>
                    {match.transaction.status === 'initiated' && (
                      <Button
                        type="primary"
                        block
                        loading={busyId === match.transaction.id}
                        onClick={() => confirmPayment(match.transaction!.id)}
                      >
                        Confirm payment
                      </Button>
                    )}
                    {match.transaction.status === 'confirmed' &&
                      (alreadyReviewed ? (
                        <Typography.Text type="secondary">
                          You've reviewed this match.
                        </Typography.Text>
                      ) : (
                        <Button block onClick={() => setReviewMatch(match)}>
                          Leave review
                        </Button>
                      ))}
                  </Space>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>
      {reviewMatch && (
        <ReviewModal
          match={reviewMatch}
          onClose={() => setReviewMatch(null)}
          onSubmitted={refresh}
        />
      )}
    </div>
  );
};

export default MatchList;
