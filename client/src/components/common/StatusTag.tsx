// Soft fill, strong text and a dot (see .isoko-status in theme/global.css).
// antd's preset tag colours derive from the primary colour, which made
// "processing" dark-on-dark; these are set explicitly for contrast in both themes.
const SUCCESS = new Set(['completed', 'approved', 'confirmed', 'active', 'verified', 'released', 'decided', 'joined', 'endorsed', 'resolved']);
const WARNING = new Set(['pending', 'initiated', 'pending_review', 'held', 'awaiting', 'invited', 'escalated']);
const ERROR = new Set(['rejected', 'cancelled', 'failed', 'suspended', 'declined']);
const INFO = new Set(['open', 'accepted', 'matched']);

const toneFor = (status: string): string => {
  if (SUCCESS.has(status)) return 'success';
  if (WARNING.has(status)) return 'warning';
  if (ERROR.has(status)) return 'error';
  if (INFO.has(status)) return 'info';
  return 'neutral';
};

const label = (status: string) => status.replace(/_/g, ' ');

const StatusTag = ({ status }: { status: string }) => (
  <span className={`isoko-status isoko-status--${toneFor(status)}`}>{label(status)}</span>
);

export default StatusTag;
