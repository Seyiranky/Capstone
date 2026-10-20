import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Flex,
  Input,
  Modal,
  Pagination,
  Rate,
  Row,
  Select,
  Space,
  Typography,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchMatches } from "../../store/slices/matchSlice";
import { matchApi } from "../../api/matchApi";
import { reviewApi } from "../../api/reviewApi";
import IdentityLink from "../common/IdentityLink";
import StatusTag from "../common/StatusTag";
import MatchExplanation from "../common/MatchExplanation";
import JobPaymentPanel from "./JobPaymentPanel";
import JobPhotos from "./JobPhotos";
import TeamSection from "../Team/TeamSection";
import SafeVisitBar from "../Safety/SafeVisitBar";
import JobCoverCard from "../Cover/JobCoverCard";
import { disputeApi, type DisputeEligibility } from "../../api/disputeApi";
import OpenDisputeModal from "../Disputes/OpenDisputeModal";
import type { Dispute, Match, MatchStatus } from "../../types";
import {
  MATCH_SORTS,
  MATCH_STAGES,
  actionFor,
  matchesSearch,
  sortMatches,
  stageOf,
  type MatchSort,
  type MatchStage,
} from "../../lib/matchStage";

const PAGE_SIZE = 12;
/** The card's tag uses the same words as the filter chips. */
const STAGE_TAG: Record<MatchStage, string> = {
  invited: "awaitingConfirmation",
  in_progress: "inProgress",
  awaiting_payment: "awaitingPayment",
  paid: "paid",
  closed: "cancelled",
};
type StatusFilter = "all" | "needs" | MatchStage;

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
  // Which jobs the viewer may dispute, at which stage and for which reasons: the server decides.
  const [disputable, setDisputable] = useState<Map<string, DisputeEligibility>>(
    new Map(),
  );
  const [disputing, setDisputing] = useState<DisputeEligibility | null>(null);
  // Filters live in the address, beside ?tab=matches, so a refresh or the back
  // button keeps them and a link can point at "what needs me".
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status") as StatusFilter | null;
  const status: StatusFilter =
    statusParam && (["all", "needs", ...MATCH_STAGES] as string[]).includes(statusParam) ? statusParam : "all";
  const sortParam = params.get("sort") as MatchSort | null;
  const sort: MatchSort = sortParam && MATCH_SORTS.includes(sortParam) ? sortParam : "action";
  const search = params.get("q") ?? "";
  const [page, setPage] = useState(1);
  const setFilter = (key: "status" | "sort" | "q", value: string, fallback: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== fallback) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
    setPage(1);
  };

  const loadDisputes = () => {
    disputeApi
      .eligible()
      .then((all) =>
        setDisputable(new Map(all.filter((e) => e.canOpen).map((e) => [e.matchId, e]))),
      )
      .catch(() => undefined);
    return disputeApi
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
  };

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

  const viewer = { id: profile?.id ?? "", role: profile?.role ?? null };
  const actionOf = (m: Match) => actionFor(m, viewer, { liveDispute: liveDisputes.has(m.id) });

  // Counts for the chips come from the searched list, so they say what a click will show.
  const searched = useMemo(
    () => matches.filter((m) => matchesSearch(m, search, profile?.role ?? null)),
    [matches, search, profile?.role],
  );
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: searched.length, needs: 0, invited: 0, in_progress: 0, awaiting_payment: 0, paid: 0, closed: 0 };
    for (const m of searched) {
      c[stageOf(m)] += 1;
      if (actionOf(m)) c.needs += 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, liveDisputes, profile?.id]);
  const visible = useMemo(
    () =>
      sortMatches(
        searched.filter((m) => status === "all" || (status === "needs" ? Boolean(actionOf(m)) : stageOf(m) === status)),
        sort,
        (m) => Boolean(actionOf(m)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searched, status, sort, liveDisputes, profile?.id],
  );

  if (!profile) return null;
  const isWorker = profile.role === "worker";

  if (matches.length === 0) {
    return (
      <Card>
        <Empty description={t("common.noMatches")} />
      </Card>
    );
  }

  const chips: StatusFilter[] = ["all", "needs", ...MATCH_STAGES.filter((s) => counts[s] > 0 || status === s)];
  const filtered = status !== "all" || search.trim() !== "";
  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <Card className="isoko-filterbar" styles={{ body: { padding: 14 } }}>
        <Flex wrap="wrap" gap={10} align="center">
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: "var(--isoko-muted)" }} />}
            placeholder={t(isWorker ? "matches.searchWorker" : "matches.searchClient")}
            value={search}
            onChange={(e) => setFilter("q", e.target.value, "")}
            style={{ flex: "2 1 240px" }}
            aria-label={t("matches.searchLabel")}
          />
          <Select
            value={sort}
            prefix={
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {t("workers.sortBy")}
              </Typography.Text>
            }
            options={MATCH_SORTS.map((s) => ({ value: s, label: t(`matches.sort_${s}`) }))}
            onChange={(v) => setFilter("sort", v, "action")}
            style={{ flex: "1 1 220px" }}
          />
        </Flex>
        <Flex wrap="wrap" gap={8} style={{ marginTop: 12 }} role="group" aria-label={t("matches.filterLabel")}>
          {chips.map((s) => (
            <button
              key={s}
              type="button"
              className={`isoko-filter-chip${status === s ? " isoko-filter-chip--on" : ""}${s === "needs" && counts.needs > 0 && status !== s ? " isoko-filter-chip--attention" : ""}`}
              aria-pressed={status === s}
              onClick={() => setFilter("status", s, "all")}
            >
              {t(`matches.stage_${s}`)}
              <span className="isoko-filter-chip__count">{counts[s]}</span>
            </button>
          ))}
        </Flex>
      </Card>

      <Flex justify="space-between" align="center" wrap="wrap" gap={8} style={{ margin: "0 2px 12px" }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {t("matches.showing", { shown: visible.length, total: matches.length })}
        </Typography.Text>
        {filtered && (
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => {
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("status");
                  next.delete("q");
                  return next;
                },
                { replace: true },
              );
              setPage(1);
            }}
          >
            {t("matches.clearFilters")}
          </Button>
        )}
      </Flex>

      {visible.length === 0 && (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={status === "needs" && !search ? t("matches.nothingNeedsYou") : t("matches.noneMatch")}
          />
        </Card>
      )}

      <Row gutter={[16, 16]}>
        {pageItems
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
            const action = actionOf(match);
            return (
              <Col xs={24} sm={12} lg={8} key={match.id}>
                <Card style={{ height: "100%" }} className={action ? "isoko-match-card--yours" : undefined}>
                  {action && (
                    <span className="isoko-your-turn">{t("matches.yourTurn", { action: t(`matches.action_${action}`) })}</span>
                  )}
                  <Flex justify="space-between" align="flex-start" gap={8}>
                    <Link
                      to={`/gigs/${match.gigId}`}
                      style={{ fontWeight: 600 }}
                    >
                      {match.gig?.title ?? "Gig"}
                    </Link>
                    <StatusTag status={STAGE_TAG[stageOf(match)]} />
                  </Flex>
                  <div style={{ margin: "10px 0" }}>
                    {counterparty ? (
                      <IdentityLink
                        id={counterparty.id}
                        name={counterparty.name}
                        src={counterparty.avatarUrl}
                        size={24}
                      />
                    ) : (
                      <Typography.Text type="secondary">
                        {t("common.unknownCounterparty")}
                      </Typography.Text>
                    )}
                  </div>

                  {/* Safety first on the card: check in, check out and SOS for whoever is on site. */}
                  {isWorker &&
                    (isLead || myMembership?.status === "joined") &&
                    (match.status === "accepted" ||
                      (match.status === "completed" &&
                        Date.now() - new Date(match.completedAt ?? match.updatedAt ?? 0).getTime() < 2 * 86_400_000)) && (
                      <SafeVisitBar matchId={match.id} active={match.status === "accepted"} />
                    )}
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
                  {/* In progress, or done and waiting for the client's Mobile Money payment. */}
                  {isLead &&
                    (match.status === "accepted" ||
                      (match.status === "completed" &&
                        match.transaction?.status !== "confirmed")) && (
                    <JobPaymentPanel
                      match={match}
                      isWorker={isWorker}
                      liveDispute={liveDisputes.get(match.id)}
                      onChanged={refresh}
                    />
                  )}

                  {match.status === "completed" &&
                    match.transaction?.status === "confirmed" && (
                    <Space
                      direction="vertical"
                      size={8}
                      style={{ width: "100%" }}
                    >
                      <Flex align="center" gap={8} wrap="wrap">
                        {/* "Paid" is already the card's tag; this says how the job was closed. */}
                        {match.completedVia && (
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: 12 }}
                          >
                            {t(`pay.completedVia_${match.completedVia}`)}
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
                    <Flex justify="space-between" align="center" gap={8} wrap="wrap" style={{ marginTop: 10 }}>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => setToolsFor(match)}
                        style={{ padding: 0 }}
                      >
                        {t("matches.moreForJob")}
                      </Button>
                      {liveDisputes.has(match.id) ? (
                        // The payment panel already shows an open dispute on a job it covers.
                        !(isLead && (match.status === "accepted" || match.transaction?.status !== "confirmed")) && (
                        <Link to="/disputes" style={{ fontSize: 13 }}>
                          {t("dispute.viewOpen")}
                        </Link>
                        )
                      ) : (
                        disputable.has(match.id) && (
                          <Button
                            type="link"
                            size="small"
                            danger
                            style={{ padding: 0 }}
                            onClick={() => setDisputing(disputable.get(match.id)!)}
                          >
                            {t("dispute.openLink")}
                          </Button>
                        )
                      )}
                    </Flex>
                  )}
                </Card>
              </Col>
            );
          })}
      </Row>
      {visible.length > PAGE_SIZE && (
        <Flex justify="center" style={{ marginTop: 20 }}>
          <Pagination
            current={page}
            pageSize={PAGE_SIZE}
            total={visible.length}
            onChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            showSizeChanger={false}
          />
        </Flex>
      )}
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
      {disputing && (
        <OpenDisputeModal
          job={disputing}
          onClose={() => setDisputing(null)}
          onOpened={refresh}
        />
      )}
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
