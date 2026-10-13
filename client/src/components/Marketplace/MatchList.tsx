import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Flex,
  Input,
  Modal,
  Rate,
  Row,
  Space,
  Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchMatches } from "../../store/slices/matchSlice";
import { matchApi } from "../../api/matchApi";
import { transactionApi } from "../../api/transactionApi";
import { reviewApi } from "../../api/reviewApi";
import IdentityLink from "../common/IdentityLink";
import StatusTag from "../common/StatusTag";
import MatchExplanation from "../common/MatchExplanation";
import JobEscrowPanel from "./JobEscrowPanel";
import JobPhotos from "./JobPhotos";
import TeamSection from "../Team/TeamSection";
import SafeVisitBar from "../Safety/SafeVisitBar";
import JobCoverCard from "../Cover/JobCoverCard";
import { disputeApi } from "../../api/disputeApi";
import type { Dispute, Match, MatchStatus } from "../../types";

const ReviewModal = ({
  match,
  onClose,
  onSubmitted,
}: {
  match: Match;
  onClose: () => void;
  onSubmitted: () => void;
}) => {
  const { t } = useTranslation();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await reviewApi.createReview({
        matchId: match.id,
        rating,
        comment: comment || undefined,
      });
      onSubmitted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={t("common.reviewTitle", { title: match.gig?.title ?? "" })}
      okText={t("common.leaveReview")}
      confirmLoading={submitting}
      onOk={handleSubmit}
      onCancel={onClose}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div>
          <Typography.Text type="secondary">
            {t("common.rating")}
          </Typography.Text>
          <br />
          <Rate value={rating} onChange={setRating} />
        </div>
        <div>
          <Typography.Text type="secondary">
            {t("common.commentOptional")}
          </Typography.Text>
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

const ORDER: Partial<Record<MatchStatus, number>> = {
  pending: 0,
  accepted: 1,
  completed: 2,
};

const MatchList = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { profile } = useAppSelector((state) => state.auth);
  const matches = useAppSelector((state) => state.matches.items);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewMatch, setReviewMatch] = useState<Match | null>(null);
  // Crew, photos, Job Cover and safe visit live in a side panel, not on the card.
  const [toolsFor, setToolsFor] = useState<Match | null>(null);
  const [liveDisputes, setLiveDisputes] = useState<Map<string, Dispute>>(
    new Map(),
  );

  const loadDisputes = () =>
    disputeApi
      .list()
      .then((all) =>
        setLiveDisputes(
          new Map(
            all
              .filter(
                (d) =>
                  d.myRole !== "mediator" &&
                  (d.status === "open" || d.status === "escalated"),
              )
              .map((d) => [d.matchId, d]),
          ),
        ),
      )
      .catch(() => undefined);

  useEffect(() => {
    dispatch(fetchMatches());
    loadDisputes();
  }, [dispatch]);

  const refresh = () => {
    dispatch(fetchMatches());
    loadDisputes();
  };

  const transition = async (
    matchId: string,
    status: MatchStatus,
    declineReason?: string,
  ) => {
    setBusyId(matchId);
    try {
      await matchApi.updateMatchStatus(matchId, status, declineReason);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const promptDecline = (match: Match) => {
    let reason = "";
    Modal.confirm({
      title: t("matches.declineTitle", { title: match.gig?.title ?? "" }),
      content: (
        <Space
          direction="vertical"
          size={8}
          style={{ width: "100%", marginTop: 8 }}
        >
          <Typography.Text type="secondary">
            {t("matches.declineExplainer")}
          </Typography.Text>
          <Input.TextArea
            rows={2}
            placeholder={t("matches.declineReasonPlaceholder")}
            onChange={(e) => {
              reason = e.target.value;
            }}
          />
        </Space>
      ),
      okText: t("matches.decline"),
      okButtonProps: { danger: true },
      onOk: () => transition(match.id, "cancelled", reason || undefined),
    });
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
  const isWorker = profile.role === "worker";

  if (matches.length === 0) {
    return (
      <Card>
        <Empty description={t("common.noMatches")} />
      </Card>
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        {[...matches]
          // What needs an answer or is under way comes before finished work.
          .sort(
            (a, b) =>
              (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) ||
              (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
          )
          .map((match) => {
            const alreadyReviewed = match.reviews?.some(
              (r) => r.authorId === profile.id,
            );
            // Crew and apprentices see the job too; money and handover stay with the lead.
            const isLead = !isWorker || match.workerId === profile.id;
            const myMembership = match.members?.find(
              (m) => m.userId === profile.id,
            );
            const counterparty = isWorker ? match.gig?.client : match.worker;
            return (
              <Col xs={24} sm={12} lg={8} key={match.id}>
                <Card style={{ height: "100%" }}>
                  <Flex justify="space-between" align="flex-start" gap={8}>
                    <Link
                      to={`/gigs/${match.gigId}`}
                      style={{ fontWeight: 600 }}
                    >
                      {match.gig?.title ?? "Gig"}
                    </Link>
                    <StatusTag status={match.status} />
                  </Flex>
                  <div style={{ margin: "10px 0" }}>
                    {counterparty ? (
                      <IdentityLink
                        id={counterparty.id}
                        name={counterparty.name}
                        size={24}
                      />
                    ) : (
                      <Typography.Text type="secondary">
                        {t("common.unknownCounterparty")}
                      </Typography.Text>
                    )}
                  </div>

                  {match.origin === "ranked" && match.scoreBreakdown && (
                    <details style={{ marginBottom: 10 }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: 12,
                          opacity: 0.75,
                        }}
                      >
                        {t("match.explainTitle")}
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        <MatchExplanation breakdown={match.scoreBreakdown} />
                      </div>
                    </details>
                  )}

                  {match.status === "pending" && (
                    <Space
                      direction="vertical"
                      size={8}
                      style={{ width: "100%" }}
                    >
                      <Typography.Text type="secondary">
                        {isWorker
                          ? t("matches.pendingWorkerPrompt")
                          : t("matches.pendingClientPrompt")}
                      </Typography.Text>
                      {isWorker && (
                        <Flex gap={8}>
                          <Button
                            type="primary"
                            block
                            loading={busyId === match.id}
                            onClick={() => transition(match.id, "accepted")}
                          >
                            {t("matches.confirm")}
                          </Button>
                          <Button
                            block
                            danger
                            onClick={() => promptDecline(match)}
                          >
                            {t("matches.decline")}
                          </Button>
                        </Flex>
                      )}
                    </Space>
                  )}

                  {match.status === "accepted" && !isLead && myMembership && (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {t("team.memberOnly", {
                        role: t(
                          `team.roleLabel_${myMembership.role}`,
                        ).toLowerCase(),
                      })}
                    </Typography.Text>
                  )}
                  {match.status === "accepted" && isLead && (
                    <JobEscrowPanel
                      match={match}
                      isWorker={isWorker}
                      liveDispute={liveDisputes.get(match.id)}
                      onChanged={refresh}
                    />
                  )}

                  {match.status === "completed" && match.transaction && (
                    <Space
                      direction="vertical"
                      size={8}
                      style={{ width: "100%" }}
                    >
                      <Flex align="center" gap={8} wrap="wrap">
                        <StatusTag
                          status={
                            match.transaction.escrowStatus === "released"
                              ? "released"
                              : match.transaction.status
                          }
                        />
                        {match.completedVia && (
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: 12 }}
                          >
                            {t(`escrow.completedVia_${match.completedVia}`)}
                          </Typography.Text>
                        )}
                      </Flex>
                      {isLead && match.transaction.receiptNumber && (
                        <Link
                          to={`/r/${match.transaction.receiptNumber}`}
                          style={{ fontSize: 13 }}
                        >
                          {t("receipt.view")} ·{" "}
                          {match.transaction.receiptNumber}
                        </Link>
                      )}
                      {/* A job completed before it was funded is paid now, and the
                        money goes straight to the worker. */}
                      {match.transaction.status === "initiated" &&
                        !isWorker && (
                          <Button
                            type="primary"
                            block
                            loading={busyId === match.transaction.id}
                            onClick={() =>
                              confirmPayment(match.transaction!.id)
                            }
                          >
                            {t("escrow.fundButton")}
                          </Button>
                        )}
                      {isLead &&
                        match.transaction.status === "confirmed" &&
                        (alreadyReviewed ? (
                          <Typography.Text type="secondary">
                            {t("matches.alreadyReviewed")}
                          </Typography.Text>
                        ) : (
                          <Button block onClick={() => setReviewMatch(match)}>
                            {t("common.leaveReview")}
                          </Button>
                        ))}
                    </Space>
                  )}
                  {(match.status === "accepted" ||
                    match.status === "completed") && (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => setToolsFor(match)}
                      style={{ padding: 0, marginTop: 10 }}
                    >
                      {t("matches.moreForJob")}
                    </Button>
                  )}
                </Card>
              </Col>
            );
          })}
      </Row>
      <Drawer
        open={Boolean(toolsFor)}
        onClose={() => setToolsFor(null)}
        title={toolsFor?.gig?.title}
        width={420}
        destroyOnHidden
      >
        {toolsFor &&
          (() => {
            const m = matches.find((x) => x.id === toolsFor.id) ?? toolsFor;
            const lead = !isWorker || m.workerId === profile.id;
            return (
              <Flex vertical gap={20}>
                {m.status === "accepted" && isWorker && lead && (
                  <SafeVisitBar matchId={m.id} />
                )}
                <JobCoverCard matchId={m.id} />
                <TeamSection match={m} onChanged={refresh} />
                <JobPhotos
                  match={m}
                  canAdd={isWorker && lead}
                  onChanged={refresh}
                />
              </Flex>
            );
          })()}
      </Drawer>
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
