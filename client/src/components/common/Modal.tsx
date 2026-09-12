import type { ReactNode } from 'react';
import { Modal as AntdModal } from 'antd';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Thin antd-backed shim. Rendered only while open (call sites mount/unmount it),
// so `open` is always true here.
const Modal = ({ title, onClose, children }: ModalProps) => (
  <AntdModal open title={title} onCancel={onClose} footer={null} destroyOnHidden>
    {children}
  </AntdModal>
);

export default Modal;
