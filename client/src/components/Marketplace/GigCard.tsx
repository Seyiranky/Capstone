import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, Flex, Tooltip, Typography } from "antd";
import { AudioOutlined, HeartFilled, HeartOutlined } from "@ant-design/icons";
import { formatClock } from "../../utils/formatClock";
import { useSavedGigs } from "../../hooks/useSavedGigs";
import GigCover from "../common/GigCover";
import StatusTag from "../common/StatusTag";
import { locationName } from "../../utils/locationName";
import type { Gig } from "../../types";

interface GigCardProps {
  gig: Gig;
  footNote?: string;
  /** The client's own gig: show where it stands instead of offering to save it. */
  own?: boolean;
}

const GigCard = ({ gig, footNote, own = false }: GigCardProps) => {
  const navigate = useNavigate();
  const { isSaved, toggle } = useSavedGigs();
  const { t } = useTranslation();
  // Posted in the last three days.
  const isNew =
    Date.now() - new Date(gig.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000;
  const loc = locationName(gig.locationLat, gig.locationLng);
  const saved = isSaved(gig.id);

  return (
    <Card
      hoverable
      onClick={() => navigate(`/gigs/${gig.id}`)}
      styles={{ body: { padding: 14 } }}
      style={{ height: "100%" }}
      cover={
        <GigCover
          gig={gig}
          style={{
            aspectRatio: "16 / 9",
            borderBottom:
              "1px solid var(--ant-color-border-secondary, #e4e4e7)",
          }}
        >
          {isNew && (
            <span className="isoko-cover__chip">
              {t("marketplace.newBadge")}
            </span>
          )}
          {gig.voiceNoteUrl && (
            <span
              className="isoko-cover__chip isoko-cover__chip--end"
              title={t("voice.gigListen")}
            >
              <AudioOutlined /> {formatClock(gig.voiceNoteDurationSec ?? 0)}
            </span>
          )}
          {own ? (
            <span style={{ position: "absolute", top: 8, right: 8 }}>
              <StatusTag status={gig.status} />
            </span>
          ) : (
            <Tooltip
              title={saved ? t("marketplace.unsave") : t("marketplace.save")}
            >
              <button
                type="button"
                aria-label={
                  saved ? t("marketplace.unsave") : t("marketplace.save")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(gig.id);
                }}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 30,
                  height: 30,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.92)",
                  color: saved ? "#e11d48" : "var(--isoko-muted)",
                }}
              >
                {saved ? <HeartFilled /> : <HeartOutlined />}
              </button>
            </Tooltip>
          )}
        </GigCover>
      }
    >
      <Typography.Text
        type="secondary"
        style={{
          display: "block",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
        ellipsis
      >
        {gig.skill?.name}
      </Typography.Text>

      {/* Two lines for the title: one cut most titles mid-word on a laptop. */}
      <Typography.Paragraph
        strong
        ellipsis={{ rows: 2, tooltip: gig.title }}
        style={{
          fontSize: 14.5,
          lineHeight: 1.35,
          margin: "4px 0 0",
          minHeight: 39,
        }}
      >
        {gig.title}
      </Typography.Paragraph>

      <Typography.Paragraph
        type="secondary"
        ellipsis={{ rows: 2 }}
        style={{ margin: "4px 0 0", fontSize: 12.5, minHeight: 34 }}
      >
        {gig.description}
      </Typography.Paragraph>

      <Flex
        justify="space-between"
        align="baseline"
        gap={10}
        style={{
          marginTop: 10,
          borderTop: "1px solid var(--ant-color-border-secondary,#e4e4e7)",
          paddingTop: 10,
        }}
      >
        <Typography.Text
          strong
          style={{ fontSize: 15, whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {Number(gig.budget).toLocaleString()}
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, fontWeight: 400 }}
          >
            {" "}
            RWF
          </Typography.Text>
        </Typography.Text>
        <Typography.Text
          type="secondary"
          style={{ fontSize: 12, minWidth: 0 }}
          ellipsis
        >
          {footNote ?? loc}
        </Typography.Text>
      </Flex>
    </Card>
  );
};

export default GigCard;
