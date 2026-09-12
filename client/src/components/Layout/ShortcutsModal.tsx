import { Modal, Typography } from 'antd';

const ROWS: [string, string][] = [
  ['⌘K  /  Ctrl K', 'Open command palette'],
  ['?', 'Show this help'],
  ['Esc', 'Close a dialog or the palette'],
  ['↑ ↓  then  Enter', 'Move and open in the command palette'],
];

const Key = ({ children }: { children: string }) => (
  <kbd
    style={{
      fontFamily: 'inherit',
      fontSize: 12,
      padding: '2px 7px',
      borderRadius: 4,
      border: '1px solid var(--ant-color-border, #e4e4e7)',
      background: 'var(--ant-color-fill-quaternary, #fafafa)',
    }}
  >
    {children}
  </kbd>
);

const ShortcutsModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Modal open={open} onCancel={onClose} footer={null} title="Keyboard shortcuts" width={420}>
    <div style={{ display: 'grid', gap: 12 }}>
      {ROWS.map(([keys, desc]) => (
        <div key={keys} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <Typography.Text type="secondary">{desc}</Typography.Text>
          <Key>{keys}</Key>
        </div>
      ))}
    </div>
  </Modal>
);

export default ShortcutsModal;
