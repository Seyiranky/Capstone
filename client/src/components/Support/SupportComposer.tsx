import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Input, Tooltip } from 'antd';
import { CloseOutlined, PaperClipOutlined, SendOutlined } from '@ant-design/icons';

const MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/**
 * A reply box with one optional attachment. `actions` adds buttons beside Send
 * (the admin's "Send and resolve"); each receives the text and file.
 */
const SupportComposer = ({
  placeholder,
  sendLabel,
  onSend,
  actions,
  value,
  onChange,
  tone,
}: {
  placeholder: string;
  sendLabel?: string;
  onSend: (body: string, file: File | null) => Promise<unknown>;
  actions?: (send: (fn: (body: string, file: File | null) => Promise<unknown>) => void, busy: boolean) => ReactNode;
  value?: string;
  onChange?: (v: string) => void;
  tone?: 'note';
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [own, setOwn] = useState('');
  const text = value ?? own;
  const setText = onChange ?? setOwn;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const run = async (fn: (body: string, file: File | null) => Promise<unknown>) => {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      await fn(text.trim(), file);
      setText('');
      setFile(null);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg ?? t('support.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`isoko-support-composer${tone === 'note' ? ' isoko-support-composer--note' : ''}`}>
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        autoSize={{ minRows: 3, maxRows: 10 }}
        maxLength={4000}
        variant="borderless"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(onSend);
        }}
      />
      <Flex justify="space-between" align="center" gap={8} wrap="wrap" className="isoko-support-composer__bar">
        <Flex align="center" gap={6} style={{ minWidth: 0 }}>
          <Tooltip title={t('support.attach')}>
            <Button type="text" icon={<PaperClipOutlined />} onClick={() => input.current?.click()} aria-label={t('support.attach')} />
          </Tooltip>
          {file && (
            <span className="isoko-support-chip">
              <span className="isoko-support-chip__name">{file.name}</span>
              <CloseOutlined onClick={() => setFile(null)} />
            </span>
          )}
        </Flex>
        <Flex gap={8}>
          {actions?.(run, busy)}
          <Button type="primary" icon={<SendOutlined />} loading={busy} disabled={!text.trim() && !file} onClick={() => run(onSend)}>
            {sendLabel ?? t('support.reply')}
          </Button>
        </Flex>
      </Flex>
      <input
        ref={input}
        type="file"
        accept={SUPPORT_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (f && f.size > MAX_BYTES) {
            message.error(t('support.attachTooBig'));
            return;
          }
          setFile(f);
        }}
      />
    </div>
  );
};

export default SupportComposer;
