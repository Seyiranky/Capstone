import { Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Provenance } from '../../types';

// Ascending credibility. Colour carries the same ordering as the wording so a
// reader does not have to decode the label to see which is stronger.
const COLOUR: Record<Provenance, string> = {
  self_declared: 'default',
  document_sighted: 'blue',
  peer_reviewed: 'green',
  work_earned: 'gold',
};

/**
 * Says how a claim was established, with the caveat attached.
 *
 * The tooltip is not decoration: "a reviewer saw this certificate" and "this
 * certificate is genuine" are different claims, and only the first is one this
 * platform can make.
 */
const ProvenanceTag = ({
  provenance,
  showHelp = true,
}: {
  provenance: Provenance;
  showHelp?: boolean;
}) => {
  const { t } = useTranslation();

  const tag = (
    <Tag color={COLOUR[provenance]} style={{ margin: 0 }}>
      {t(`credentials.tier.${provenance}`)}
    </Tag>
  );

  return showHelp ? (
    <Tooltip title={t(`credentials.tierHelp.${provenance}`)}>{tag}</Tooltip>
  ) : (
    tag
  );
};

export default ProvenanceTag;
