import { Tag } from 'antd';

// antd preset colors: success / warning / error / processing / default
const SUCCESS = new Set(['completed', 'approved', 'confirmed', 'active', 'verified']);
const WARNING = new Set(['pending', 'initiated', 'pending_review']);
const ERROR = new Set(['rejected', 'cancelled', 'failed', 'suspended']);
const PROCESSING = new Set(['open', 'accepted', 'matched']);

const colorFor = (status: string): string => {
  if (SUCCESS.has(status)) return 'success';
  if (WARNING.has(status)) return 'warning';
  if (ERROR.has(status)) return 'error';
  if (PROCESSING.has(status)) return 'processing';
  return 'default';
};

const label = (status: string) => status.replace(/_/g, ' ');

const StatusTag = ({ status }: { status: string }) => (
  <Tag color={colorFor(status)} style={{ textTransform: 'capitalize', marginInlineEnd: 0 }}>
    {label(status)}
  </Tag>
);

export default StatusTag;
