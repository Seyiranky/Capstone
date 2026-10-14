import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  Row,
  Select,
  Skeleton,
  Typography,
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import PageContainer from "../Layout/PageContainer";
import WorkerCard from "./WorkerCard";
import OfferGigModal from "./OfferGigModal";
import {
  directoryApi,
  type DirectoryQuery,
  type DirectoryWorker,
} from "../../api/directoryApi";
import { skillApi } from "../../api/skillApi";
import { useAppSelector } from "../../store/hooks";
import { KIGALI_LOCATIONS } from "../../constants/locations";
import type { Skill } from "../../types";

/** Areas as the directory names them: the short form of each Kigali location. */
const AREAS = KIGALI_LOCATIONS.map((l) => l.name.replace(/ \(.*\)$/, ""));

/**
 * The worker directory, for clients who would rather choose than wait.
 * Filters are the questions a client asks: what trade, where, proven or not,
 * free now. Each worker can be messaged or offered one of the client's open gigs.
 */
const FindWorkersPage = () => {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.auth.role);
  const [query, setQuery] = useState<DirectoryQuery>({
    sort: "trust",
    available: true,
  });
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{
    total: number;
    workers: DirectoryWorker[];
  } | null>(null);
  const [trades, setTrades] = useState<Skill[]>([]);
  const [offering, setOffering] = useState<DirectoryWorker | null>(null);

  useEffect(() => {
    skillApi
      .listSkills()
      .then((all) => setTrades(all.filter((s) => !s.parentId)));
  }, []);

  // Typing waits for a pause before searching.
  useEffect(() => {
    const id = window.setTimeout(
      () => setQuery((q) => ({ ...q, q: search.trim() || undefined })),
      300,
    );
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let live = true;
    setResult(null);
    directoryApi.list(query).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [query]);

  const filtered = Boolean(
    query.q || query.category || query.area || query.proven || query.available,
  );
  const clearFilters = () => {
    setSearch("");
    setQuery({ sort: query.sort });
  };
  // A skill or an area clicked on a card narrows the list to it.
  const pick = (patch: DirectoryQuery) => {
    setQuery((q) => ({ ...q, ...patch }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const tradeOptions = useMemo(
    () => [
      { value: "", label: t("workers.allTrades") },
      ...trades.map((s) => ({ value: s.category, label: s.name })),
    ],
    [trades, t],
  );

  return (
    <PageContainer title={t("workers.title")} subtitle={t("workers.subtitle")}>
      <Card className="isoko-filterbar" styles={{ body: { padding: 14 } }}>
        <Flex wrap="wrap" gap={10} align="center">
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: "var(--isoko-muted)" }} />}
            placeholder={t("workers.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "2 1 240px" }}
          />
          <Select
            value={query.category ?? ""}
            options={tradeOptions}
            onChange={(v) =>
              setQuery((q) => ({ ...q, category: v || undefined }))
            }
            style={{ flex: "1 1 180px" }}
          />
          <Select
            value={query.area ?? ""}
            options={[
              { value: "", label: t("workers.anyArea") },
              ...AREAS.map((a) => ({ value: a, label: a })),
            ]}
            onChange={(v) => setQuery((q) => ({ ...q, area: v || undefined }))}
            style={{ flex: "1 1 150px" }}
          />
          <Select
            value={query.sort}
            prefix={
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {t("workers.sortBy")}
              </Typography.Text>
            }
            options={(["trust", "jobs", "newest"] as const).map((s) => ({
              value: s,
              label: t(`workers.sort_${s}`),
            }))}
            onChange={(v) => setQuery((q) => ({ ...q, sort: v }))}
            style={{ flex: "1 1 190px" }}
          />
        </Flex>
        <Flex wrap="wrap" gap={8} align="center" style={{ marginTop: 12 }}>
          {(
            [
              ["available", t("workers.availableOnly"), <ThunderboltOutlined key="a" />],
              ["proven", t("workers.provenOnly"), <SafetyCertificateOutlined key="p" />],
            ] as const
          ).map(([key, label, icon]) => {
            const on = !!query[key];
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                className={`isoko-filter-chip${on ? " isoko-filter-chip--on" : ""}`}
                onClick={() =>
                  setQuery((q) => ({ ...q, [key]: on ? undefined : true }))
                }
              >
                {on ? <CheckOutlined /> : icon}
                {label}
              </button>
            );
          })}
          {filtered && (
            <Button
              type="link"
              size="small"
              icon={<CloseOutlined />}
              onClick={clearFilters}
              style={{ paddingInline: 4 }}
            >
              {t("workers.clearFilters")}
            </Button>
          )}
          {result && (
            <Typography.Text
              type="secondary"
              style={{ fontSize: 13, marginLeft: "auto" }}
            >
              {t("workers.count", { count: result.total })}
            </Typography.Text>
          )}
        </Flex>
      </Card>

      {!result ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2].map((i) => (
            <Col key={i} xs={24} md={12} xl={8}>
              <Card>
                <Skeleton avatar active paragraph={{ rows: 3 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : result.workers.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("workers.none")}
          >
            {filtered && (
              <Button onClick={clearFilters}>{t("workers.clearFilters")}</Button>
            )}
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {result.workers.map((w) => (
            <Col key={w.id} xs={24} md={12} xl={8}>
              <WorkerCard
                worker={w}
                onOffer={role === "client" ? setOffering : undefined}
                onTrade={(category) => pick({ category })}
                onArea={(area) => pick({ area })}
              />
            </Col>
          ))}
        </Row>
      )}

      <OfferGigModal worker={offering} onClose={() => setOffering(null)} />
    </PageContainer>
  );
};

export default FindWorkersPage;
