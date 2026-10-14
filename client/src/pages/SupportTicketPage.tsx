import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Result, Skeleton } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useAppSelector } from '../store/hooks';
import RequesterTicketView from '../components/Support/RequesterTicketView';
import { supportApi, type SupportTicketDetail } from '../api/supportApi';

/** One of the signed-in person's requests. New replies appear without reloading. */
const SupportTicketPage = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const name = useAppSelector((s) => s.auth.profile?.name ?? '');
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    const load = () =>
      supportApi
        .get(id)
        .then((tk) => live && setTicket(tk))
        .catch(() => live && setMissing(true));
    load();
    // The team's replies arrive while the page is open.
    const poll = window.setInterval(load, 20000);
    return () => {
      live = false;
      window.clearInterval(poll);
    };
  }, [id]);

  const back = (
    <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/support')} style={{ marginBottom: 12, paddingInline: 4 }}>
      {t('support.back')}
    </Button>
  );

  if (missing) return <Result status="404" title={t('support.guestInvalid')} extra={back} />;
  if (!ticket) return <Skeleton active />;

  return (
    <div style={{ maxWidth: 860 }}>
      {back}
      <RequesterTicketView
        ticket={ticket}
        requesterName={name}
        onReply={async (body, file) => setTicket(await supportApi.reply(ticket.id, body, file))}
        onClose={async () => setTicket(await supportApi.close(ticket.id))}
        onRate={async (helpful) => {
          setTicket(await supportApi.rate(ticket.id, helpful));
          message.success(helpful ? t('support.ratedYes') : t('support.ratedNo'));
        }}
      />
    </div>
  );
};

export default SupportTicketPage;
