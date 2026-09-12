import { useEffect, useState } from 'react';
import { Alert, Button, Divider, Form, Input, List, Select, Typography } from 'antd';
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
  evidenceUrl: string;
  notes?: string;
}

const SkillVerificationForm = ({ tasks, onSubmitted }: SkillVerificationFormProps) => {
  const [form] = Form.useForm<SubmitValues>();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    skillApi.listSkills().then(setSkills);
  }, []);

  const onFinish = async (values: SubmitValues) => {
    setError(null);
    setSubmitting(true);
    try {
      await skillTaskApi.submitTask({
        skillId: values.skillId,
        evidenceUrl: values.evidenceUrl,
        notes: values.notes || undefined,
      });
      form.resetFields(['evidenceUrl', 'notes']);
      onSubmitted();
    } catch {
      setError('Could not submit your task. An admin may not be available right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
        <Form.Item name="skillId" label="Skill category" rules={[{ required: true }]}>
          <Select options={skills.map((s) => ({ value: s.id, label: s.name }))} />
        </Form.Item>
        <Form.Item
          name="evidenceUrl"
          label="Evidence (link to photo, video, or file)"
          rules={[{ required: true, type: 'url' }]}
        >
          <Input placeholder="https://..." />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} />
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Button type="primary" htmlType="submit" loading={submitting}>
          Submit for review
        </Button>
      </Form>

      <Divider />
      <Typography.Title level={5}>Your submissions</Typography.Title>
      <List
        dataSource={tasks}
        locale={{ emptyText: 'No submissions yet.' }}
        renderItem={(task) => (
          <List.Item actions={[<StatusTag key="s" status={task.status} />]}>
            <List.Item.Meta
              title={task.skill?.name}
              description={
                task.reviewer ? (
                  <IdentityLink id={task.reviewer.id} name={task.reviewer.name} size={20} />
                ) : (
                  <Typography.Text type="secondary">Reviewer unassigned</Typography.Text>
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
