import { Card, Empty, Timeline, Typography } from 'antd';
import {
  CheckCircleOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { fromNow } from '../../lib/time';
import type { Match, SkillTask, Transaction } from '../../types';

interface ActivityFeedProps {
  role: 'worker' | 'client' | 'admin';
  matches: Match[];
  transactions: Transaction[];
  tasks: SkillTask[];
}

interface Event {
  at: string;
  icon: React.ReactNode;
  text: string;
}

const ActivityFeed = ({ role, matches, transactions, tasks }: ActivityFeedProps) => {
  const events: Event[] = [];

  for (const m of matches) {
    const gig = m.gig?.title ?? 'a gig';
    if (m.status === 'completed') {
      events.push({ at: m.updatedAt, icon: <CheckCircleOutlined />, text: `Completed “${gig}”` });
    } else if (m.status === 'accepted') {
      events.push({ at: m.updatedAt, icon: <TeamOutlined />, text: `Matched on “${gig}”` });
    }
  }
  for (const tx of transactions) {
    if (tx.status === 'confirmed') {
      events.push({
        at: tx.createdAt,
        icon: <DollarOutlined />,
        text: `${role === 'client' ? 'Paid' : 'Received'} ${Number(tx.amount).toLocaleString()} RWF`,
      });
    }
  }
  for (const task of tasks) {
    if (task.status !== 'pending') {
      events.push({
        at: task.reviewedAt ?? task.createdAt,
        icon: <SafetyCertificateOutlined />,
        text: `Skill “${task.skill?.name ?? 'submission'}” ${task.status}`,
      });
    }
  }

  const sorted = events
    .filter((e) => e.at)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <Card title="Recent activity" style={{ height: '100%' }}>
      {sorted.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing here yet." />
      ) : (
        <Timeline
          items={sorted.map((e) => ({
            dot: e.icon,
            children: (
              <div>
                <Typography.Text>{e.text}</Typography.Text>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  {fromNow(e.at)}
                </Typography.Text>
              </div>
            ),
          }))}
        />
      )}
    </Card>
  );
};

export default ActivityFeed;
