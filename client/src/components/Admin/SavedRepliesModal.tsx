import { useState } from 'react';
import { App, Button, Flex, Form, Input, Modal, Popconfirm, Select, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { SUPPORT_CATEGORIES, supportApi, type SavedReply } from '../../api/supportApi';

const LABEL: Record<string, string> = {
  payment: 'Payments',
  account: 'Account & sign-in',
  skills: 'Skill verification',
  job: 'A job or gig',
  safety: 'Safety',
  bug: 'Something not working',
  other: 'Something else',
};

/**
 * The team's saved replies: answers given often, in English and Kinyarwanda.
 * `{{name}}` becomes the person's first name when a reply is inserted.
 */
const SavedRepliesModal = ({
  open,
  replies,
  onClose,
  onChanged,
}: {
  open: boolean;
  replies: SavedReply[];
  onClose: () => void;
  onChanged: () => void;
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<SavedReply | 'new' | null>(null);

  const start = (r: SavedReply | 'new') => {
    setEditing(r);
    form.setFieldsValue(r === 'new' ? { title: '', body: '', bodyRw: '', category: null } : r);
  };

  const save = async (v: Omit<SavedReply, 'id' | 'usageCount'>) => {
    try {
      if (editing === 'new') await supportApi.admin.createSavedReply(v);
      else if (editing) await supportApi.admin.updateSavedReply(editing.id, v);
      setEditing(null);
      onChanged();
      message.success('Saved');
    } catch {
      message.error('Could not save');
    }
  };

  return (
    <Modal open={open} onCancel={onClose} title="Saved replies" footer={null} width={640} destroyOnHidden>
      {editing ? (
        <Form form={form} layout="vertical" requiredMark={false} onFinish={save}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input maxLength={80} placeholder="e.g. MoMo prompt did not arrive" />
          </Form.Item>
          <Form.Item name="category" label="Topic it fits">
            <Select allowClear placeholder="Any topic" options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: LABEL[c] }))} />
          </Form.Item>
          <Form.Item name="body" label="English" rules={[{ required: true }]} extra="{{name}} becomes the person's first name.">
            <Input.TextArea rows={4} maxLength={2000} />
          </Form.Item>
          <Form.Item name="bodyRw" label="Kinyarwanda">
            <Input.TextArea rows={4} maxLength={2000} />
          </Form.Item>
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setEditing(null)}>Back</Button>
            <Button type="primary" htmlType="submit">
              Save
            </Button>
          </Flex>
        </Form>
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            Answers the team gives often. Insert one from Saved replies when writing to someone; it is filled in with their
            name and can be edited before sending.
          </Typography.Paragraph>
          <div className="isoko-saved-list">
            {replies.map((r) => (
              <div key={r.id} className="isoko-saved-item">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{r.title}</strong>
                  <div className="isoko-saved-item__meta">
                    {r.category ? LABEL[r.category] : 'Any topic'} · {r.bodyRw ? 'EN + RW' : 'EN only'} · used {r.usageCount}{' '}
                    {r.usageCount === 1 ? 'time' : 'times'}
                  </div>
                  <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: '4px 0 0', fontSize: 13 }}>
                    {r.body}
                  </Typography.Paragraph>
                </div>
                <Flex gap={4}>
                  <Button type="text" icon={<EditOutlined />} onClick={() => start(r)} aria-label="Edit" />
                  <Popconfirm
                    title="Delete this saved reply?"
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={async () => {
                      await supportApi.admin.deleteSavedReply(r.id);
                      onChanged();
                    }}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label="Delete" />
                  </Popconfirm>
                </Flex>
              </div>
            ))}
          </div>
          <Button icon={<PlusOutlined />} onClick={() => start('new')} style={{ marginTop: 12 }}>
            New saved reply
          </Button>
        </>
      )}
    </Modal>
  );
};

export default SavedRepliesModal;
