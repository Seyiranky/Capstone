import { Link } from 'react-router-dom';
import { Card, Flex, Progress, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckCircleFilled, RightOutlined } from '@ant-design/icons';

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  to: string;
  action: string;
}

/**
 * The first steps on Isoko. A step still to do is one link, the whole row,
 * that goes straight to where it is done; finished steps are struck through.
 */
const OnboardingChecklist = ({ items }: { items: ChecklistItem[] }) => {
  const { t } = useTranslation();
  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);
  if (doneCount === items.length) return null;

  return (
    <Card title={t('common.getSetUp')}>
      <Flex align="center" gap={20} wrap="wrap">
        <Progress
          type="circle"
          size={72}
          percent={pct}
          strokeColor="var(--isoko-navy)"
          format={() => `${doneCount}/${items.length}`}
        />
        <div style={{ flex: 1, minWidth: 240 }}>
          {items.map((item) =>
            item.done ? (
              <Flex key={item.key} align="center" gap={10} className="isoko-setup-row isoko-setup-row--done">
                <CheckCircleFilled style={{ color: 'var(--isoko-navy)', fontSize: 16 }} />
                <Typography.Text delete type="secondary" style={{ flex: 1 }}>
                  {item.label}
                </Typography.Text>
              </Flex>
            ) : (
              <Link key={item.key} to={item.to} className="isoko-setup-row">
                <span className="isoko-setup-row__circle" />
                <span className="isoko-setup-row__label">{item.label}</span>
                <span className="isoko-setup-row__action">
                  {item.action} <RightOutlined />
                </span>
              </Link>
            ),
          )}
        </div>
      </Flex>
    </Card>
  );
};

export default OnboardingChecklist;
