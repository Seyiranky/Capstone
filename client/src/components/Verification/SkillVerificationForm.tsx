import { useEffect, useState } from 'react';
import { Alert, Button, Divider, Form, Input, List, Select, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import EvidenceCapture from './EvidenceCapture';
import { skillApi } from '../../api/skillApi';
import { skillTaskApi } from '../../api/skillTaskApi';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import type { Skill, SkillTask } from '../../types';

interface SkillVerificationFormProps {
  tasks: SkillTask[];
  onSubmitted: () => void;
}

interface SubmitValues {
  skillId: string;
  evidenceUrl?: string;
  notes?: string;
}

const SkillVerificationForm = ({ tasks, onSubmitted }: SkillVerificationFormProps) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<SubmitValues>();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    skillApi.listSkills().then(setSkills);
  }, []);

  const onFinish = async (values: SubmitValues) => {
    setError(null);
    if (files.length === 0 && !values.evidenceUrl) {
      setError(t('verification.needEvidence'));
      return;
    }

    setSubmitting(true);
    try {
      await skillTaskApi.submitTask({
        skillId: values.skillId,
        evidenceUrl: values.evidenceUrl || undefined,
        notes: values.notes || undefined,
        files,
      });
      form.resetFields(['evidenceUrl', 'notes']);
      setFiles([]);
      onSubmitted();
    } catch {
      setError(t('verification.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
        <Form.Item name="skillId" label={t('verification.skillLabel')} rules={[{ required: true }]}>
          <Select options={skills.map((s) => ({ value: s.id, label: s.name }))} />
        </Form.Item>

        <Form.Item label={t('verification.evidenceLabel')}>
          <EvidenceCapture files={files} onChange={setFiles} />
        </Form.Item>

        <Form.Item
          name="evidenceUrl"
          label={t('verification.linkLabel')}
          rules={[{ type: 'url', message: t('verification.linkInvalid') }]}
        >
          <Input placeholder="https://..." />
        </Form.Item>
        <Form.Item name="notes" label={t('verification.notesLabel')}>
          <Input.TextArea rows={2} />
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Button type="primary" htmlType="submit" loading={submitting}>
          {t('verification.submit')}
        </Button>
      </Form>

      <Divider />
      <Typography.Title level={5}>{t('verification.yourSubmissions')}</Typography.Title>
      <List
        dataSource={tasks}
        locale={{ emptyText: t('verification.noSubmissions') }}
        renderItem={(task) => (
          <List.Item actions={[<StatusTag key="s" status={task.status} />]}>
            <List.Item.Meta
              title={task.skill?.name}
              description={
                task.reviewer ? (
                  <IdentityLink id={task.reviewer.id} name={task.reviewer.name} size={20} />
                ) : (
                  <Typography.Text type="secondary">{t('verification.reviewerUnassigned')}</Typography.Text>
                )
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
};

export default SkillVerificationForm;
