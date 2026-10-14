import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Alert, Button, Flex, Form, Input, Modal, Select, Typography } from 'antd';
import { CloseOutlined, PaperClipOutlined } from '@ant-design/icons';
import {
  SUPPORT_CATEGORIES,
  browserContext,
  supportApi,
  type Linkable,
  type SupportCategory,
  type SupportRelatedType,
  type SupportTicketDetail,
} from '../../api/supportApi';
import { CategoryIcon } from './supportUi';
import { SUPPORT_ACCEPT } from './SupportComposer';

export interface ContactPrefill {
  category?: SupportCategory;
  relatedType?: SupportRelatedType;
  relatedId?: string;
  subject?: string;
  from?: string;
}

const rwf = (n: number) => `${Math.round(n).toLocaleString()} RWF`;

/**
 * The contact form, opened from Help & support or from a "Need help?" link,
 * which can fill in the topic and the job or payment it is about.
 */
const ContactSupportModal = ({
  open,
  prefill,
  onClose,
  onCreated,
}: {
  open: boolean;
  prefill?: ContactPrefill;
  onClose: () => void;
  onCreated: (ticket: SupportTicketDetail) => void;
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [category, setCategory] = useState<SupportCategory | undefined>(prefill?.category);
  const [linkable, setLinkable] = useState<Linkable | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCategory(prefill?.category);
    setFile(null);
    form.setFieldsValue({
      subject: prefill?.subject ?? '',
      body: '',
      related: prefill?.relatedType && prefill.relatedId ? `${prefill.relatedType}:${prefill.relatedId}` : undefined,
    });
    supportApi.linkable().then(setLinkable).catch(() => setLinkable({ jobs: [], payments: [], skills: [] }));
  }, [open, prefill, form]);

  const relatedOptions = linkable
    ? [
        ...(linkable.payments.length
          ? [{
              label: t('support.relatedPayments'),
              options: linkable.payments.map((p) => ({
                value: `transaction:${p.id}`,
                label: `${p.title} · ${rwf(p.amount)}${p.receiptNumber ? ` · ${p.receiptNumber}` : ''}`,
              })),
            }]
          : []),
        ...(linkable.jobs.length
          ? [{ label: t('support.relatedJobs'), options: linkable.jobs.map((j) => ({ value: `match:${j.id}`, label: j.title })) }]
          : []),
        ...(linkable.skills.length
          ? [{ label: t('support.relatedSkills'), options: linkable.skills.map((s) => ({ value: `skill_task:${s.id}`, label: s.title })) }]
          : []),
      ]
    : [];

  const submit = async (values: { subject: string; body: string; related?: string }) => {
    if (!category) return;
    const [relatedType, relatedId] = values.related ? (values.related.split(':') as [SupportRelatedType, string]) : [];
    setBusy(true);
    try {
      const ticket = await supportApi.create(
        {
          category,
          subject: values.subject,
          body: values.body,
          relatedType,
          relatedId,
          context: browserContext(prefill?.from ?? window.location.pathname),
        },
        file,
      );
      message.success(t('support.sent', { number: ticket.number }));
      onCreated(ticket);
    } catch (err) {
      message.error((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? t('support.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('support.formTitle')}
      width={560}
      destroyOnHidden
      footer={null}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
        {t('support.formIntro')}
      </Typography.Paragraph>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {t('support.topic')}
      </Typography.Text>
      <div className="isoko-topic-grid">
        {SUPPORT_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`isoko-topic${category === c ? ' isoko-topic--on' : ''}`}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            <CategoryIcon category={c} size={28} />
            <span>{t(`support.cat_${c}`)}</span>
          </button>
        ))}
      </div>
      {category === 'safety' && <Alert type="error" showIcon message={t('support.safetyNow')} style={{ marginTop: 12 }} />}

      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} style={{ marginTop: 16 }} disabled={!category}>
        {relatedOptions.length > 0 && (
          <Form.Item name="related" label={t('support.related')}>
            <Select allowClear placeholder={t('support.relatedNone')} options={relatedOptions} showSearch optionFilterProp="label" />
          </Form.Item>
        )}
        <Form.Item name="subject" label={t('support.subject')}>
          <Input maxLength={140} placeholder={t('support.subjectPlaceholder')} />
        </Form.Item>
        <Form.Item
          name="body"
          label={t('support.message')}
          rules={[{ required: true, min: 10, message: t('support.messageTooShort') }]}
        >
          <Input.TextArea rows={5} maxLength={4000} showCount placeholder={t('support.messagePlaceholder')} />
        </Form.Item>
        <Flex justify="space-between" align="center" gap={12} wrap="wrap">
          <Flex align="center" gap={8} style={{ minWidth: 0 }}>
            <Button icon={<PaperClipOutlined />} onClick={() => input.current?.click()}>
              {t('support.attach')}
            </Button>
            {file ? (
              <span className="isoko-support-chip">
                <span className="isoko-support-chip__name">{file.name}</span>
                <CloseOutlined onClick={() => setFile(null)} />
              </span>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('support.attachHint')}
              </Typography.Text>
            )}
          </Flex>
          <Button type="primary" htmlType="submit" loading={busy} disabled={!category}>
            {t('support.send')}
          </Button>
        </Flex>
      </Form>
      <input
        ref={input}
        type="file"
        accept={SUPPORT_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (f && f.size > 5 * 1024 * 1024) message.error(t('support.attachTooBig'));
          else setFile(f);
        }}
      />
    </Modal>
  );
};

export default ContactSupportModal;
