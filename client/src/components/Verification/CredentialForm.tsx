import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Input, Select, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import EvidenceCapture from './EvidenceCapture';
import { skillApi } from '../../api/skillApi';
import { skillTaskApi } from '../../api/skillTaskApi';
import type { Skill } from '../../types';

interface CredentialValues {
  skillId: string;
  title: string;
  issuer: string;
  issuedOn?: string;
}

/**
 * Submits a certificate for sighting.
 *
 * The copy is careful on purpose: a reviewer confirms they saw the document.
 * Nothing here authenticates the award, and implying otherwise would be the
 * one claim this feature could not defend.
 */
const CredentialForm = ({ onSubmitted }: { onSubmitted?: () => void }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<CredentialValues>();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    skillApi.listSkills().then(setSkills);
  }, []);

  const onFinish = async (values: CredentialValues) => {
    setError(null);
    if (files.length === 0) {
      setError(t('verification.needEvidence'));
      return;
    }

    setSubmitting(true);
    try {
      await skillTaskApi.submitTask({
        skillId: values.skillId,
        kind: 'certificate',
        title: values.title,
        issuer: values.issuer,
        issuedOn: values.issuedOn,
        files,
        // A photograph of a certificate and a photograph of finished work are
        // the same mime type, so the kind has to be stated rather than sniffed.
        evidenceKinds: files.map(() => 'document'),
      });
      form.resetFields();
      setFiles([]);
      message.success(t('credentials.submit'));
      onSubmitted?.();
    } catch {
      setError(t('verification.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 0 }}>
        {t('credentials.addHint')}
      </Typography.Paragraph>

      <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
        <Form.Item name="skillId" label={t('verification.skillLabel')} rules={[{ required: true }]}>
          <Select options={skills.map((s) => ({ value: s.id, label: s.name }))} />
        </Form.Item>
        <Form.Item name="title" label={t('credentials.certTitleLabel')} rules={[{ required: true }]}>
          <Input placeholder={t('credentials.certTitlePlaceholder')} />
        </Form.Item>
        <Form.Item name="issuer" label={t('credentials.issuerLabel')} rules={[{ required: true }]}>
          <Input placeholder={t('credentials.issuerPlaceholder')} />
        </Form.Item>
        <Form.Item name="issuedOn" label={t('credentials.issuedOnLabel')}>
          <Input inputMode="numeric" style={{ width: 140 }} />
        </Form.Item>

        <Form.Item label={t('credentials.title')}>
          <EvidenceCapture
            files={files}
            onChange={setFiles}
            accept="image/*,application/pdf"
            max={3}
            photoLabelKey="credentials.addTitle"
            hintKey="credentials.addHint"
            // A certificate is a document, not a spoken account of work.
            allowVoice={false}
          />
        </Form.Item>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('credentials.honestNotice')}
        />

        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Button type="primary" htmlType="submit" loading={submitting} block>
          {t('credentials.submit')}
        </Button>
      </Form>
    </Space>
  );
};

export default CredentialForm;
