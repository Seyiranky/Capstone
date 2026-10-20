import type { ReactNode } from 'react';
import {
  AlertOutlined,
  BugOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { SupportCategory, SupportPriority } from '../../api/supportApi';

// Data and helpers shared by the support screens. Kept apart from the
// components in supportUi.tsx so that file only exports components (React
// fast refresh needs that).

type Tone = 'blue' | 'teal' | 'amber' | 'violet' | 'rose' | 'green' | 'grey';

/** Each topic's icon and colour, the same everywhere a topic is shown. */
export const CATEGORY_META: Record<SupportCategory, { icon: ReactNode; tone: Tone }> = {
  payment: { icon: <WalletOutlined />, tone: 'green' },
  account: { icon: <UserOutlined />, tone: 'blue' },
  skills: { icon: <SafetyCertificateOutlined />, tone: 'violet' },
  job: { icon: <ToolOutlined />, tone: 'teal' },
  safety: { icon: <AlertOutlined />, tone: 'rose' },
  bug: { icon: <BugOutlined />, tone: 'amber' },
  other: { icon: <QuestionCircleOutlined />, tone: 'grey' },
};

const PRIORITY_COLOR: Record<SupportPriority, string> = {
  urgent: '#e11d48',
  high: '#f59e0b',
  normal: '#2563eb',
  low: '#a1a1aa',
};
export const priorityColor = (p: SupportPriority) => PRIORITY_COLOR[p];

/** "3 h", "2 d": how long something has waited. */
export const waited = (iso: string) => {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
};
