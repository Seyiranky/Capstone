import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { App, Modal, Radio, Space, Typography } from 'antd';
import { directoryApi } from '../../api/directoryApi';
import { gigApi } from '../../api/gigApi';
import { useAppSelector } from '../../store/hooks';
import { apiErrorMessage } from '../../utils/apiError';
import type { Gig } from '../../types';

/**
 * A client offers one of their open gigs to a worker. The worker confirms;
 * the client pays with Mobile Money once the job is done, as for any match.
 */
const OfferGigModal = ({ worker, onClose }: { worker: { id: string; name: string } | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const myId = useAppSelector((s) => s.auth.profile?.id);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [gigId, setGigId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!worker) return;
    setGigId(null);
    gigApi.listGigs({ status: 'open' }).then((all) => setGigs(all.filter((g) => g.clientId === myId)));
  }, [worker, myId]);

  const send = async () => {
    if (!worker || !gigId) return;
    setBusy(true);
    try {
      await directoryApi.invite(gigId, worker.id);
      message.success(t('workers.offered', { name: worker.name }));
      onClose();
    } catch (err) {
      message.error(apiErrorMessage(err, t('workers.offerFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(worker)}
      title={t('workers.offerTitle', { name: worker?.name ?? '' })}
      okText={t('workers.sendOffer')}
      okButtonProps={{ disabled: !gigId }}
      confirmLoading={busy}
      onOk={send}
      onCancel={onClose}
      destroyOnHidden
    >
      {gigs.length === 0 ? (
        <Typography.Paragraph>
          {t('workers.noOpenGigs')} <Link to="/marketplace">{t('workers.postFirst')}</Link>
        </Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
            {t('workers.offerIntro', { name: worker?.name.split(' ')[0] ?? '' })}
          </Typography.Paragraph>
          <Radio.Group value={gigId} onChange={(e) => setGigId(e.target.value)}>
            <Space direction="vertical">
              {gigs.map((g) => (
                <Radio key={g.id} value={g.id}>
                  {g.title} · {Number(g.budget).toLocaleString()} RWF
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </>
      )}
    </Modal>
  );
};

export default OfferGigModal;
