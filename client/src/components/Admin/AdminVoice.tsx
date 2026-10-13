import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Card, Col, Flex, Form, Input, InputNumber, Row, Typography } from 'antd';
import { CheckOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import ActionMenu from '../common/ActionMenu';
import PollCard from '../WorkerVoice/PollCard';
import { workerVoiceApi, type VoicePoll } from '../../api/workerVoiceApi';
import { apiErrorMessage } from '../../utils/apiError';

interface PollForm {
  question: string;
  details?: string;
  options: string[];
  closesInDays: number;
}

/** Admins put rules to the workers, and close each poll by saying what was done. */
const AdminVoice = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<PollForm>();
  const [polls, setPolls] = useState<VoicePoll[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => workerVoiceApi.list().then(setPolls);
  useEffect(() => {
    load();
  }, []);

  const create = async (values: PollForm) => {
    setBusy(true);
    try {
      await workerVoiceApi.create({ ...values, options: values.options.map((o) => o.trim()).filter(Boolean) });
      message.success(t('workerVoice.opened'));
      form.resetFields();
      load();
    } catch (err) {
      message.error(apiErrorMessage(err, t('workerVoice.openFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer title={t('workerVoice.adminTitle')} subtitle={t('workerVoice.adminSub')}>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Card title={t('workerVoice.newPoll')}>
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              onFinish={create}
              initialValues={{ options: ['', ''], closesInDays: 7 }}
            >
              <Form.Item name="question" label={t('workerVoice.question')} rules={[{ required: true, max: 200 }]}>
                <Input placeholder={t('workerVoice.questionHint')} />
              </Form.Item>
              <Form.Item name="details" label={t('workerVoice.details')} rules={[{ max: 1000 }]}>
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.List name="options">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field, i) => (
                      <Flex key={field.key} gap={8} align="baseline">
                        <Form.Item
                          {...field}
                          label={i === 0 ? t('workerVoice.options') : undefined}
                          rules={[{ required: true, max: 80, message: t('workerVoice.optionRule') }]}
                          style={{ flex: 1 }}
                        >
                          <Input placeholder={t('workerVoice.option', { n: i + 1 })} />
                        </Form.Item>
                        {fields.length > 2 && (
                          <MinusCircleOutlined onClick={() => remove(field.name)} style={{ color: 'var(--isoko-muted)' }} />
                        )}
                      </Flex>
                    ))}
                    {fields.length < 5 && (
                      <Button type="dashed" icon={<PlusOutlined />} onClick={() => add('')} block style={{ marginBottom: 16 }}>
                        {t('workerVoice.addOption')}
                      </Button>
                    )}
                  </>
                )}
              </Form.List>
              <Form.Item name="closesInDays" label={t('workerVoice.days')} rules={[{ required: true }]}>
                <InputNumber min={1} max={30} addonAfter={t('workerVoice.daysUnit')} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={busy} block>
                {t('workerVoice.open')}
              </Button>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
                {t('workerVoice.openHint')}
              </Typography.Paragraph>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={15}>
          <Flex vertical gap={16}>
            {polls?.map((p) => (
              <PollCard
                key={p.id}
                poll={p}
                extra={
                  p.phase !== 'closed' && (
                    <ActionMenu
                      size="small"
                      actions={[
                        {
                          key: 'close',
                          label: t('workerVoice.close'),
                          icon: <CheckOutlined />,
                          confirmTitle: t('workerVoice.close'),
                          confirmBody: t('workerVoice.closeBody'),
                          reason: { placeholder: t('workerVoice.outcomeHint'), required: true },
                          onConfirm: async (outcome) => {
                            try {
                              await workerVoiceApi.close(p.id, outcome ?? '');
                              message.success(t('workerVoice.closedMsg'));
                              load();
                            } catch (err) {
                              message.error(apiErrorMessage(err, t('workerVoice.openFailed')));
                              throw err;
                            }
                          },
                        },
                      ]}
                    />
                  )
                }
              />
            ))}
          </Flex>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default AdminVoice;
