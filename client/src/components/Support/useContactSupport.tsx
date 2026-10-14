import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ContactSupportModal, { type ContactPrefill } from './ContactSupportModal';

/**
 * Opens the contact form from anywhere in the help centre. Returns the
 * function to open it and the modal to render; a sent request opens its thread.
 */
export const useContactSupport = (onClosed?: () => void) => {
  const navigate = useNavigate();
  const [prefill, setPrefill] = useState<ContactPrefill | null>(null);
  const close = () => {
    setPrefill(null);
    onClosed?.();
  };
  const modal = (
    <ContactSupportModal
      open={prefill !== null}
      prefill={prefill ?? undefined}
      onClose={close}
      onCreated={(ticket) => {
        setPrefill(null);
        navigate(`/support/${ticket.id}`);
      }}
    />
  );
  return { open: (p: ContactPrefill = {}) => setPrefill(p), modal };
};
