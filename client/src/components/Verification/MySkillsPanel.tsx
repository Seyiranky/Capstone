import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Divider, Empty, Flex, Select, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import ProvenanceTag from '../common/ProvenanceTag';
import CredentialForm from './CredentialForm';
import { skillApi } from '../../api/skillApi';
import { skillTaskApi } from '../../api/skillTaskApi';
import type { Skill, UserSkill } from '../../types';

/**
 * What a worker says they can do, and how far each claim has been established.
 *
 * Registration captures no competence at all, so without this a worker arrives
 * with an empty profile and cannot be matched to anything until a review
 * completes — which over a short pilot means most people are invisible for most
 * of it.
 */
const MySkillsPanel = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mine, setMine] = useState<UserSkill[]>([]);
  const [choice, setChoice] = useState<string | undefined>();
  const [level, setLevel] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => skillTaskApi.listMySkills().then(setMine), []);

  useEffect(() => {
    skillApi.listSkillTree().then((tree) =>
      setSkills(tree.flatMap((category) => [category, ...(category.children ?? [])])),
    );
    refresh();
  }, [refresh]);

  const declare = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      await skillTaskApi.declareSkill(choice, level);
      setChoice(undefined);
      setLevel(undefined);
      message.success(t('credentials.declared'));
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const held = new Set(mine.map((m) => m.skillId));

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title={t('credentials.mySkills')}>
        {mine.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('credentials.noSkills')} />
        ) : (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {mine.map((userSkill) => (
              <Flex key={userSkill.id} justify="space-between" align="center" gap={10} wrap>
                <Space size={8}>
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    {userSkill.skill?.name}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('skills.level', { level: userSkill.proficiencyLevel })}
                  </Typography.Text>
                </Space>
                <ProvenanceTag provenance={userSkill.provenance ?? 'self_declared'} />
              </Flex>
            ))}
          </Space>
        )}

        <Divider plain style={{ marginTop: 20 }}>
          {t('credentials.declareTitle')}
        </Divider>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('credentials.declareHint')}
        </Typography.Paragraph>
        <Flex gap={8} wrap>
          <Select
            style={{ minWidth: 220, flex: 1 }}
            placeholder={t('verification.skillLabel')}
            value={choice}
            onChange={setChoice}
            options={skills
              .filter((s) => !held.has(s.id))
              // Specialisations are indented under their category so the
              // hierarchy reads without a second dropdown.
              .map((s) => ({
                value: s.id,
                label: s.parentId ? `— ${s.name}` : s.name,
              }))}
          />
          <Select
            style={{ width: 180 }}
            placeholder={t('skills.anyLevel')}
            value={level}
            onChange={setLevel}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: t(`skills.levelName.${n}`) }))}
          />
          <Button type="primary" onClick={declare} loading={busy} disabled={!choice}>
            {t('credentials.declareSubmit')}
          </Button>
        </Flex>
      </Card>

      <Card title={t('credentials.addTitle')}>
        <CredentialForm onSubmitted={refresh} />
      </Card>
    </Space>
  );
};

export default MySkillsPanel;
