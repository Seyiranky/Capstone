import { Link } from 'react-router-dom';
import { Card, Flex, Progress, Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  to: string;
  action: string;
}

const OnboardingChecklist = ({ items }: { items: ChecklistItem[] }) => {
  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);
  if (doneCount === items.length) return null;

  return (
    <Card title="Get set up" style={{ marginBottom: 16 }}>
      <Flex align="center" gap={20} wrap="wrap">
        <Progress
          type="circle"
          size={72}
          percent={pct}
          strokeColor="#18181b"
          format={() => `${doneCount}/${items.length}`}
        />
        <div style={{ flex: 1, minWidth: 240 }}>
          {items.map((item) => (
            <Flex key={item.key} align="center" gap={10} style={{ padding: '7px 0' }}>
              {item.done ? (
                <CheckCircleFilled style={{ color: '#18181b', fontSize: 16 }} />
              ) : (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: '1.5px solid #d4d4d8',
                    flexShrink: 0,
                  }}
                />
              )}
              <Typography.Text
                delete={item.done}
                type={item.done ? 'secondary' : undefined}
                style={{ flex: 1 }}
              >
                {item.label}
              </Typography.Text>
              {!item.done && <Link to={item.to}>{item.action}</Link>}
            </Flex>
          ))}
        </div>
      </Flex>
    </Card>
  );
};

export default OnboardingChecklist;
