import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, Input, Modal, Typography } from 'antd';
import { MoreOutlined } from '@ant-design/icons';

export interface MenuAction {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  /** Opens the caller's own dialog instead of the standard confirmation. */
  onSelect?: () => void;
  /** Shown in the confirmation dialog. */
  confirmTitle?: string;
  confirmBody?: ReactNode;
  confirmLabel?: string;
  /** Ask for a short reason in the dialog; it is passed to onConfirm. */
  reason?: { placeholder: string; required?: boolean };
  onConfirm?: (reason?: string) => Promise<unknown> | unknown;
}

/**
 * A "⋯" button holding a row's decisions.
 *
 * Decisions such as approve, reject, suspend or delete sit behind one button
 * and a confirmation instead of side by side, where a stray tap on a phone
 * could fire the wrong one. Rejections can ask for a reason in the same dialog.
 */
const ActionMenu = ({ actions, disabled, size = 'middle' }: { actions: MenuAction[]; disabled?: boolean; size?: 'small' | 'middle' }) => {
  const { t } = useTranslation();
  const [active, setActive] = useState<MenuAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await active.onConfirm?.(reason.trim() || undefined);
      setActive(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dropdown
        trigger={['click']}
        disabled={disabled}
        placement="bottomRight"
        menu={{
          items: actions.map((a) => ({ key: a.key, label: a.label, icon: a.icon, danger: a.danger })),
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation();
            const action = actions.find((a) => a.key === key) ?? null;
            if (action?.onSelect) {
              action.onSelect();
              return;
            }
            setReason('');
            setActive(action);
          },
        }}
      >
        <Button
          size={size}
          type="text"
          icon={<MoreOutlined style={{ fontSize: 18 }} />}
          aria-label={t('actions.more')}
          onClick={(e) => e.stopPropagation()}
          style={{ border: '1px solid var(--isoko-border)' }}
        />
      </Dropdown>
      <Modal
        open={Boolean(active)}
        title={active?.confirmTitle}
        okText={active?.confirmLabel ?? active?.label}
        okButtonProps={{
          danger: active?.danger,
          disabled: Boolean(active?.reason?.required && !reason.trim()),
        }}
        confirmLoading={busy}
        onOk={confirm}
        onCancel={() => setActive(null)}
        destroyOnHidden
      >
        {active?.confirmBody && (
          <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
            {active.confirmBody}
          </Typography.Paragraph>
        )}
        {active?.reason && (
          <Input.TextArea
            autoFocus
            rows={3}
            maxLength={280}
            showCount
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={active.reason.placeholder}
            style={{ marginBottom: 12 }}
          />
        )}
      </Modal>
    </>
  );
};

export default ActionMenu;
