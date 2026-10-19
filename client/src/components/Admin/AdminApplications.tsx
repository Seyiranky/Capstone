import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Button, Card, Dropdown, Empty, Flex, Input, Modal, Segmented, Skeleton, Tooltip, Typography } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import Avatar from '../common/Avatar';
import { adminApi, type ApplicationFlag, type ApplicationsOverview, type OverseenApplication } from '../../api/adminApi';
import { apiErrorMessage } from '../../utils/apiError';

const FLAG: Record<ApplicationFlag, { label: string; tone: string; help: string }> = {
  overdue: { label: 'Waiting on the client', tone: 'amber', help: 'Unanswered for more than 48 hours. It expires at 7 days.' },
  sensitive: { label: 'Sensitive gig', tone: 'violet', help: 'Children or working inside a home: worth a spot check.' },
  report_worker: { label: 'Worker reported', tone: 'rose', help: 'There is an open report about this worker.' },
  report_client: { label: 'Client reported', tone: 'rose', help: 'There is an open report about this client.' },
  burst: { label: 'Many in minutes', tone: 'rose', help: 'This worker sent five or more applications within ten minutes.' },
  low_price: { label: 'Very low price', tone: 'amber', help: 'Under half of what this trade usually pays at the low end.' },
};
const ORDER: ApplicationFlag[] = ['report_worker', 'report_client', 'burst', 'low_price', 'overdue', 'sensitive'];

const waited = (h: number) => (h < 1 ? 'under an hour' : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`);
const rwf = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(Number(n)).toLocaleString()} RWF`);

/**
 * Applications, for admins. Clients decide their own applicants; this lists
 * only the ones that need a look: waiting too long, on a sensitive gig, or
 * flagged. An admin can open the gig to decide on the client's behalf,
 * withdraw an application with a reason, or message either person.
 */
const AdminApplications = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [view, setView] = useState<'flagged' | 'all'>('flagged');
  const [only, setOnly] = useState<ApplicationFlag | null>(null);
  const [data, setData] = useState<ApplicationsOverview | null>(null);
  const [withdrawing, setWithdrawing] = useState<OverseenApplication | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => adminApi.applications(view === 'all').then(setData).catch(() => setData((d) => d ?? { applications: [], counts: {} as ApplicationsOverview['counts'], pendingTotal: 0 })),
    [view],
  );
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const shown = useMemo(
    () => (data?.applications ?? []).filter((a) => !only || a.flags.includes(only)),
    [data, only],
  );

  const message_ = (person: { id: string; name: string } | null) =>
    person && navigate('/notifications', { state: { contact: { id: person.id, name: person.name } } });

  const withdraw = async () => {
    if (!withdrawing) return;
    setBusy(true);
    try {
      await adminApi.withdrawApplication(withdrawing.id, reason.trim());
      message.success('Application withdrawn. The worker and the client have been told.');
      setWithdrawing(null);
      load();
    } catch (err) {
      message.error(apiErrorMessage(err, 'Could not withdraw it'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer
      title="Applications"
      subtitle="Clients choose their own applicants. These are the applications that may need you: waiting too long, on a sensitive gig, or flagged."
    >
      <Flex justify="space-between" align="center" gap={12} wrap="wrap" style={{ marginBottom: 14 }}>
        <Segmented
          value={view}
          onChange={(v) => setView(v as 'flagged' | 'all')}
          options={[
            { value: 'flagged', label: 'Needs a look' },
            { value: 'all', label: `All pending${data ? ` (${data.pendingTotal})` : ''}` },
          ]}
        />
        {data && (
          <Flex gap={6} wrap="wrap">
            {ORDER.filter((f) => data.counts[f]).map((f) => (
              <button
                key={f}
                type="button"
                className={`isoko-flag isoko-flag--${FLAG[f].tone}${only === f ? ' isoko-flag--on' : ''}`}
                onClick={() => setOnly(only === f ? null : f)}
                aria-pressed={only === f}
              >
                {FLAG[f].label} · {data.counts[f]}
              </button>
            ))}
          </Flex>
        )}
      </Flex>

      {!data ? (
        <Card>
          <Skeleton active />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={view === 'flagged' ? 'Nothing needs a look. Clients are answering their applicants.' : 'No pending applications.'}
          />
        </Card>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          {shown.map((a) => (
            <div key={a.id} className="isoko-overseen">
              <Avatar name={a.worker?.name ?? '?'} src={a.worker?.avatarUrl} size={36} />
              <div className="isoko-overseen__main">
                <div className="isoko-overseen__line">
                  <Link to={`/profile/${a.worker?.id}`} style={{ fontWeight: 600 }}>
                    {a.worker?.name}
                  </Link>
                  <span className="isoko-overseen__muted">applied to</span>
                  <Link to={`/gigs/${a.gig.id}`}>{a.gig.title}</Link>
                </div>
                <div className="isoko-overseen__meta">
                  <span>Client {a.client?.name ?? '—'}</span>
                  <span>waiting {waited(a.waitedHours)}{a.remindedAt ? ' · client reminded' : ''}</span>
                  <span>
                    {rwf(a.price)}
                    {a.usualLow ? ` (trade usually from ${rwf(a.usualLow)})` : ''}
                  </span>
                  <span>
                    {a.worker?.completedJobCount ?? 0} paid jobs ·{' '}
                    {a.worker?.reviewCount ? `${Number(a.worker.trustScore).toFixed(1)} trust` : 'no reviews'}
                  </span>
                </div>
                {a.flags.length > 0 && (
                  <Flex gap={6} wrap="wrap" style={{ marginTop: 8 }}>
                    {ORDER.filter((f) => a.flags.includes(f)).map((f) => (
                      <Tooltip key={f} title={FLAG[f].help}>
                        <span className={`isoko-flag isoko-flag--${FLAG[f].tone} isoko-flag--static`}>{FLAG[f].label}</span>
                      </Tooltip>
                    ))}
                  </Flex>
                )}
              </div>
              <Flex gap={6} align="center" className="isoko-overseen__actions">
                <Link to={`/gigs/${a.gig.id}`}>
                  <Button size="small">Open gig</Button>
                </Link>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'worker', label: `Message ${a.worker?.name ?? 'the worker'}` },
                      { key: 'client', label: `Message ${a.client?.name ?? 'the client'}` },
                      { type: 'divider' },
                      { key: 'withdraw', label: 'Withdraw application…', danger: true },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'worker') message_(a.worker);
                      if (key === 'client') message_(a.client);
                      if (key === 'withdraw') {
                        setReason('');
                        setWithdrawing(a);
                      }
                    },
                  }}
                >
                  <Button size="small" type="text" icon={<MoreOutlined />} aria-label="More actions" />
                </Dropdown>
              </Flex>
            </div>
          ))}
        </Card>
      )}

      <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginTop: 12 }}>
        To decide on the client's behalf, open the gig: an admin sees the same Approve and Reject as the client, and the client is told.
      </Typography.Paragraph>

      <Modal
        open={Boolean(withdrawing)}
        title={`Withdraw ${withdrawing?.worker?.name ?? 'this'}'s application?`}
        okText="Withdraw"
        okButtonProps={{ danger: true, disabled: reason.trim().length < 5, loading: busy }}
        onOk={withdraw}
        onCancel={() => setWithdrawing(null)}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          The worker sees this reason; the client is told an admin withdrew it.
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          maxLength={280}
          showCount
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example: applied to many gigs in seconds without reading them."
        />
      </Modal>
    </PageContainer>
  );
};

export default AdminApplications;
