import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Flex,
  Grid,
  Input,
  Row,
  Segmented,
  Select,
  Skeleton,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  FlagOutlined,
  InboxOutlined,
  LikeOutlined,
  LinkOutlined,
  LockOutlined,
  MessageOutlined,
  SearchOutlined,
  SendOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import StatTile from '../common/StatTile';
import Avatar from '../common/Avatar';
import SupportThread from '../Support/SupportThread';
import SupportComposer from '../Support/SupportComposer';
import { CategoryIcon, PriorityTag, StatusPill, priorityColor, waited } from '../Support/supportUi';
import SavedRepliesModal from './SavedRepliesModal';
import { useAppSelector } from '../../store/hooks';
import { fromNow } from '../../lib/time';
import {
  SUPPORT_CATEGORIES,
  supportApi,
  type AdminTicketDetail,
  type SavedReply,
  type SupportMetrics,
  type SupportPerson,
  type SupportTicket,
} from '../../api/supportApi';

const CATEGORY_LABEL: Record<string, string> = {
  payment: 'Payments',
  account: 'Account & sign-in',
  skills: 'Skill verification',
  job: 'A job or gig',
  safety: 'Safety',
  bug: 'Something not working',
  other: 'Something else',
};
const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'waiting_on_user', label: 'Waiting on person' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];
const PRIORITY_OPTIONS = ['urgent', 'high', 'normal', 'low'].map((p) => ({
  value: p,
  label: <PriorityTag priority={p as SupportTicket['priority']} />,
}));
const DISPUTE_REASONS = [
  { key: 'notDone', label: 'The work was not done' },
  { key: 'poorQuality', label: 'The work is not what was agreed' },
  { key: 'noShow', label: 'The other person did not show up' },
  { key: 'notReleased', label: 'Done, but not marked done' },
  { key: 'other', label: 'Something else' },
];
const REPORT_REASONS = [
  { key: 'payment_outside', label: 'Asked to pay outside Isoko' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'no_show', label: 'Did not show up' },
  { key: 'fake_profile', label: 'Fake profile' },
  { key: 'other', label: 'Something else' },
];

const hoursLabel = (h: number | null) => (h == null ? '—' : h < 1 ? '< 1 h' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);
const requesterName = (t: SupportTicket) => t.user?.name ?? t.guestName ?? 'Guest';

/** One request in the list. */
const TicketRow = ({ ticket, active, onClick }: { ticket: SupportTicket; active: boolean; onClick: () => void }) => {
  const overdue = ticket.status === 'open' && Date.now() - new Date(ticket.lastMessageAt).getTime() > 24 * 3_600_000;
  return (
    <button
      type="button"
      className={`isoko-inbox-row${active ? ' isoko-inbox-row--active' : ''}${ticket.adminUnread ? ' isoko-inbox-row--unread' : ''}`}
      onClick={onClick}
      style={{ boxShadow: `inset 3px 0 0 ${priorityColor(ticket.priority)}` }}
    >
      <Avatar name={requesterName(ticket)} src={ticket.user?.avatarUrl} size={34} />
      <span className="isoko-inbox-row__main">
        <span className="isoko-inbox-row__top">
          <span className="isoko-inbox-row__name">{requesterName(ticket)}</span>
          <span className={`isoko-inbox-row__time${overdue ? ' isoko-inbox-row__time--late' : ''}`}>
            {ticket.status === 'open' ? <ClockCircleOutlined /> : null} {waited(ticket.lastMessageAt)}
          </span>
        </span>
        <span className="isoko-inbox-row__subject">{ticket.subject}</span>
        <span className="isoko-inbox-row__tags">
          <span>{CATEGORY_LABEL[ticket.category]}</span>
          {!ticket.userId && <span className="isoko-inbox-row__guest">Guest</span>}
          <StatusPill status={ticket.status} />
          {ticket.assignee && (
            <Tooltip title={`Assigned to ${ticket.assignee.name}`}>
              <span style={{ display: 'inline-flex' }}>
                <Avatar name={ticket.assignee.name} src={ticket.assignee.avatarUrl} size={18} />
              </span>
            </Tooltip>
          )}
        </span>
      </span>
    </button>
  );
};

/** The person who asked, beside the thread. */
const PersonPanel = ({ ticket }: { ticket: AdminTicketDetail }) => {
  const p = ticket.person;
  return (
    <div className="isoko-support-side">
      <Typography.Text type="secondary" className="isoko-support-side__label">
        Person
      </Typography.Text>
      {p ? (
        <>
          <Flex gap={10} align="center">
            <Avatar name={p.name} src={p.avatarUrl} size={42} />
            <div style={{ minWidth: 0 }}>
              <Link to={`/profile/${p.id}`} style={{ fontWeight: 600 }}>
                {p.name}
              </Link>
              <div className="isoko-support-side__sub">
                {p.role[0].toUpperCase() + p.role.slice(1)} · joined {new Date(p.createdAt).toLocaleDateString()}
              </div>
            </div>
          </Flex>
          <div className="isoko-support-side__facts">
            <span>Email</span>
            <span>
              {p.email} {p.emailVerifiedAt ? <CheckCircleOutlined style={{ color: '#16a34a' }} /> : null}
            </span>
            <span>Phone</span>
            <span>
              {p.phone ?? '—'} {p.phoneVerifiedAt ? <CheckCircleOutlined style={{ color: '#16a34a' }} /> : null}
            </span>
            <span>Trust</span>
            <span>{p.reviewCount ? `${Number(p.trustScore).toFixed(1)} · ${p.reviewCount} reviews` : 'No reviews yet'}</span>
            <span>Paid jobs</span>
            <span>{p.completedJobCount}</span>
            <span>Account</span>
            <span style={{ color: p.status === 'suspended' ? '#e11d48' : undefined }}>{p.status}</span>
          </div>
          {p.recentJobs.length > 0 && (
            <>
              <Typography.Text type="secondary" className="isoko-support-side__label">
                Recent jobs
              </Typography.Text>
              {p.recentJobs.map((j) => (
                <Link key={j.id} to={j.gigId ? `/gigs/${j.gigId}` : '#'} className="isoko-support-side__item">
                  <span>{j.title}</span>
                  <span>{j.asWorker ? 'worker' : 'client'} · {j.status}</span>
                </Link>
              ))}
            </>
          )}
          {p.tickets.length > 1 && (
            <>
              <Typography.Text type="secondary" className="isoko-support-side__label">
                Other requests
              </Typography.Text>
              {p.tickets
                .filter((o) => o.id !== ticket.id)
                .map((o) => (
                  <div key={o.id} className="isoko-support-side__item">
                    <span>{o.subject}</span>
                    <span>
                      {o.number} · {o.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
            </>
          )}
        </>
      ) : (
        <>
          <Flex gap={10} align="center">
            <Avatar name={ticket.guestName ?? 'Guest'} size={42} />
            <div>
              <strong>{ticket.guestName}</strong>
              <div className="isoko-support-side__sub">Not signed in · replies go by email</div>
            </div>
          </Flex>
          <div className="isoko-support-side__facts">
            <span>Email</span>
            <span>{ticket.guestEmail}</span>
          </div>
        </>
      )}
      {ticket.context && (
        <>
          <Typography.Text type="secondary" className="isoko-support-side__label">
            Opened from
          </Typography.Text>
          <div className="isoko-support-side__facts">
            {ticket.context.path && (
              <>
                <span>Page</span>
                <span>{ticket.context.path}</span>
              </>
            )}
            {ticket.context.screen && (
              <>
                <span>Screen</span>
                <span>{ticket.context.screen}</span>
              </>
            )}
            {ticket.context.language && (
              <>
                <span>Language</span>
                <span>{ticket.context.language}</span>
              </>
            )}
          </div>
          {ticket.context.userAgent && (
            <Typography.Paragraph type="secondary" style={{ fontSize: 11.5, marginTop: 6 }} ellipsis={{ rows: 2, tooltip: ticket.context.userAgent }}>
              {ticket.context.userAgent}
            </Typography.Paragraph>
          )}
        </>
      )}
    </div>
  );
};

/** The selected request: header controls, thread, composer, and the person beside it. */
const TicketDetail = ({
  id,
  admins,
  saved,
  onChanged,
  onBack,
}: {
  id: string;
  admins: SupportPerson[];
  saved: SavedReply[];
  onChanged: () => void;
  onBack?: () => void;
}) => {
  const { message, modal } = App.useApp();
  const me = useAppSelector((s) => s.auth.profile);
  const screens = Grid.useBreakpoint();
  const [ticket, setTicket] = useState<AdminTicketDetail | null>(null);
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [draft, setDraft] = useState('');
  const [savedId, setSavedId] = useState<string | undefined>();
  const [lang, setLang] = useState<'en' | 'rw'>('en');

  const load = useCallback(() => supportApi.admin.get(id).then(setTicket), [id]);
  useEffect(() => {
    setTicket(null);
    setDraft('');
    setMode('reply');
    load();
  }, [load]);

  if (!ticket) return <Card><Skeleton active /></Card>;
  const firstName = (ticket.person?.name ?? ticket.guestName ?? '').split(' ')[0];

  const change = async (input: Parameters<typeof supportApi.admin.update>[1]) => {
    await supportApi.admin.update(ticket.id, input);
    await load();
    onChanged();
  };

  const insertSaved = (r: SavedReply) => {
    const text = (lang === 'rw' && r.bodyRw ? r.bodyRw : r.body).replace(/\{\{name\}\}/g, firstName);
    setDraft((d) => (d.trim() ? `${d.trim()}\n\n${text}` : text));
    setSavedId(r.id);
    setMode('reply');
  };

  const escalate = (to: 'dispute' | 'report', reason: string) =>
    modal.confirm({
      title: to === 'dispute' ? 'Open a dispute on this job?' : 'Report the other person on this job?',
      content:
        to === 'dispute'
          ? 'Three independent mediators will be asked to decide, as if the person had opened it themselves. They are told it came from support.'
          : 'A report is filed in the person’s name with this request’s text, and appears under People & trust › Reports.',
      okText: to === 'dispute' ? 'Open dispute' : 'File report',
      onOk: async () => {
        try {
          await supportApi.admin.escalate(ticket.id, { to, reason });
          message.success(to === 'dispute' ? 'Dispute opened' : 'Report filed');
          await load();
          onChanged();
        } catch (err) {
          message.error((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Could not escalate');
        }
      },
    });

  const matchLinked = ticket.relatedType === 'match' || ticket.relatedType === 'transaction';
  const send = async (body: string, file: File | null, status?: 'resolved') => {
    await supportApi.admin.reply(ticket.id, { body, internal: mode === 'note', status, savedReplyId: savedId }, file);
    setSavedId(undefined);
    await load();
    onChanged();
  };

  return (
    <Card styles={{ body: { padding: 0 } }} className="isoko-support-card">
      <div className="isoko-support-head">
        {onBack && (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ marginBottom: 8, paddingInline: 4 }}>
            All requests
          </Button>
        )}
        <Flex gap={12} align="flex-start">
          <CategoryIcon category={ticket.category} size={40} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {ticket.subject}
            </Typography.Title>
            <div className="isoko-support-head__meta">
              <span>{ticket.number}</span>
                            <span>opened {fromNow(ticket.createdAt)}</span>
              {ticket.firstResponseAt && (
                <>
                                    <span>first reply after {hoursLabel((new Date(ticket.firstResponseAt).getTime() - new Date(ticket.createdAt).getTime()) / 3_600_000)}</span>
                </>
              )}
              {ticket.helpful !== null && (
                <>
                                    <span style={{ color: ticket.helpful ? '#16a34a' : '#e11d48' }}>
                    <LikeOutlined rotate={ticket.helpful ? 0 : 180} /> {ticket.helpful ? 'Helped' : 'Did not help'}
                  </span>
                </>
              )}
            </div>
          </div>
        </Flex>
        <Flex gap={8} wrap="wrap" style={{ marginTop: 14 }}>
          <Select size="small" value={ticket.status} options={STATUS_OPTIONS} onChange={(status) => change({ status })} style={{ width: 168 }} />
          <Select size="small" value={ticket.priority} options={PRIORITY_OPTIONS} onChange={(priority) => change({ priority })} style={{ width: 112 }} />
          <Select
            size="small"
            value={ticket.assigneeId ?? ''}
            onChange={(v) => change({ assigneeId: v || null })}
            style={{ width: 170 }}
            options={[{ value: '', label: 'Unassigned' }, ...admins.map((a) => ({ value: a.id, label: a.id === me?.id ? `${a.name} (me)` : a.name }))]}
          />
          <Select
            size="small"
            value={ticket.category}
            onChange={(category) => change({ category })}
            style={{ width: 170 }}
            options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
          />
          {ticket.escalatedTo ? (
            <Link to={ticket.escalatedTo === 'dispute' ? '/disputes' : '/admin/reports'}>
              <Button size="small" icon={ticket.escalatedTo === 'dispute' ? <AuditOutlined /> : <FlagOutlined />}>
                Became a {ticket.escalatedTo}
              </Button>
            </Link>
          ) : (
            <Dropdown
              trigger={['click']}
              disabled={!ticket.userId}
              menu={{
                items: [
                  {
                    key: 'dispute',
                    label: 'Open a dispute on the job',
                    icon: <AuditOutlined />,
                    disabled: !matchLinked,
                    children: DISPUTE_REASONS.map((r) => ({ key: `dispute:${r.key}`, label: r.label })),
                  },
                  {
                    key: 'report',
                    label: 'Report the other person',
                    icon: <FlagOutlined />,
                    disabled: !matchLinked,
                    children: REPORT_REASONS.map((r) => ({ key: `report:${r.key}`, label: r.label })),
                  },
                ],
                onClick: ({ key }) => {
                  const [to, reason] = key.split(':') as ['dispute' | 'report', string];
                  escalate(to, reason);
                },
              }}
            >
              <Button size="small" icon={<ThunderboltOutlined />}>
                Escalate
              </Button>
            </Dropdown>
          )}
        </Flex>
        {ticket.related && (
          <div className="isoko-support-related">
            <LinkOutlined />
            <span className="isoko-support-related__text">
              About: <strong>{ticket.related.title}</strong>
              {ticket.related.detail ? ` · ${ticket.related.detail}` : ''}
              {ticket.related.status ? ` · ${ticket.related.status}` : ''}
            </span>
            {ticket.related.gigId && <Link to={`/gigs/${ticket.related.gigId}`}>Open</Link>}
          </div>
        )}
      </div>

      <Row>
        <Col xs={24} xl={16} className="isoko-support-main">
          <div className="isoko-support-body">
            <SupportThread messages={ticket.messages} viewer="admin" requesterName={ticket.person?.name ?? ticket.guestName ?? 'Guest'} />
          </div>
          <div className="isoko-support-foot">
            <Flex justify="space-between" align="center" gap={8} wrap="wrap" style={{ marginBottom: 8 }}>
              <Segmented
                size="small"
                value={mode}
                onChange={(v) => setMode(v as 'reply' | 'note')}
                options={[
                  { value: 'reply', label: <span><MessageOutlined /> Reply</span> },
                  { value: 'note', label: <span><LockOutlined /> Internal note</span> },
                ]}
              />
              {mode === 'reply' && (
                <Flex gap={6} align="center">
                  <Segmented size="small" value={lang} onChange={(v) => setLang(v as 'en' | 'rw')} options={[{ value: 'en', label: 'EN' }, { value: 'rw', label: 'RW' }]} />
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: saved
                        .filter((r) => !r.category || r.category === ticket.category)
                        .concat(saved.filter((r) => r.category && r.category !== ticket.category))
                        .map((r) => ({
                          key: r.id,
                          label: (
                            <span>
                              {r.title}
                              {r.category === ticket.category && <span className="isoko-saved-match"> · fits</span>}
                            </span>
                          ),
                        })),
                      onClick: ({ key }) => {
                        const r = saved.find((x) => x.id === key);
                        if (r) insertSaved(r);
                      },
                    }}
                  >
                    <Button size="small" icon={<EditOutlined />}>
                      Saved replies
                    </Button>
                  </Dropdown>
                </Flex>
              )}
            </Flex>
            {ticket.status === 'closed' && mode === 'reply' ? (
              <Typography.Text type="secondary">Closed. Reopen it from the status menu to reply, or add an internal note.</Typography.Text>
            ) : (
              <SupportComposer
                tone={mode === 'note' ? 'note' : undefined}
                value={draft}
                onChange={setDraft}
                placeholder={mode === 'note' ? 'Only admins see this.' : `Write to ${firstName || 'them'}…  (Ctrl/⌘ + Enter to send)`}
                sendLabel={mode === 'note' ? 'Add note' : 'Send'}
                onSend={(body, file) => send(body, file)}
                actions={
                  mode === 'reply'
                    ? (run, busy) => (
                        <Button icon={<CheckCircleOutlined />} disabled={busy} onClick={() => run((b, f) => send(b, f, 'resolved'))}>
                          {screens.sm ? 'Send and resolve' : 'Resolve'}
                        </Button>
                      )
                    : undefined
                }
              />
            )}
          </div>
        </Col>
        <Col xs={24} xl={8}>
          <PersonPanel ticket={ticket} />
        </Col>
      </Row>
    </Card>
  );
};

/**
 * Support, for admins: requests waiting on the team come first, urgent ones
 * before the rest, then whoever has waited longest. Selecting one opens it
 * beside the list (below it on a phone).
 */
const AdminSupport = () => {
  const screens = Grid.useBreakpoint();
  const [status, setStatus] = useState('active');
  const [category, setCategory] = useState<string | undefined>();
  const [assignee, setAssignee] = useState<string>('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<{ tickets: SupportTicket[]; metrics: SupportMetrics; admins: SupportPerson[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedReply[]>([]);
  const [manage, setManage] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const params = useMemo(
    () => ({ status, category, assignee: assignee || undefined, q: search || undefined }),
    [status, category, assignee, search],
  );
  const load = useCallback(() => supportApi.admin.list(params).then(setData), [params]);
  const loadSaved = () => supportApi.admin.savedReplies().then(setSaved);

  useEffect(() => {
    load();
    const poll = window.setInterval(load, 30000);
    return () => window.clearInterval(poll);
  }, [load]);
  useEffect(() => {
    loadSaved();
  }, []);
  // On a wide screen the first request opens straight away.
  useEffect(() => {
    if (screens.lg && !selected && data?.tickets.length) setSelected(data.tickets[0].id);
  }, [data, screens.lg, selected]);

  const m = data?.metrics;
  const stacked = !screens.lg;

  return (
    <PageContainer
      title="Support"
      subtitle="Requests from people using Isoko. Urgent and longest-waiting first."
      extra={
        <Button icon={<EditOutlined />} onClick={() => setManage(true)}>
          Saved replies
        </Button>
      }
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={8} xl={4}>
          <StatTile icon={<InboxOutlined />} label="Open" value={m?.open ?? '—'} accent="blue" />
        </Col>
        <Col xs={12} md={8} xl={5}>
          <StatTile icon={<UserOutlined />} label="Unassigned" value={m?.unassigned ?? '—'} accent="amber" />
        </Col>
        <Col xs={12} md={8} xl={5}>
          <StatTile icon={<SendOutlined />} label="Waiting on person" value={m?.waiting ?? '—'} accent="violet" />
        </Col>
        <Col xs={12} md={12} xl={5}>
          <StatTile icon={<ClockCircleOutlined />} label="Median first reply" value={hoursLabel(m?.medianFirstReplyHours ?? null)} accent="teal" footer={<Typography.Text type="secondary" style={{ fontSize: 12 }}>last 30 days</Typography.Text>} />
        </Col>
        <Col xs={24} md={12} xl={5}>
          <StatTile
            icon={<LikeOutlined />}
            label="Solved it"
            value={m?.satisfaction == null ? '—' : `${Math.round(m.satisfaction * 100)}%`}
            accent="green"
            footer={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{m?.ratedCount ?? 0} rated</Typography.Text>}
          />
        </Col>
      </Row>

      <Card className="isoko-filterbar" styles={{ body: { padding: 12 } }}>
        <Flex gap={10} wrap="wrap" align="center">
          <Segmented
            value={status}
            onChange={(v) => {
              setStatus(v as string);
              setSelected(null);
            }}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'closed', label: 'Closed' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Input allowClear prefix={<SearchOutlined />} placeholder="Subject, reference, name or email" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 220px' }} />
          <Select allowClear placeholder="All topics" value={category} onChange={setCategory} style={{ flex: '0 1 190px', minWidth: 150 }} options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
          <Select
            value={assignee}
            onChange={setAssignee}
            style={{ flex: '0 1 170px', minWidth: 140 }}
            options={[
              { value: '', label: 'Anyone' },
              { value: 'me', label: 'Assigned to me' },
              { value: 'none', label: 'Unassigned' },
            ]}
          />
        </Flex>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={9} style={{ display: stacked && selected ? 'none' : undefined }}>
          <Card styles={{ body: { padding: 6 } }} className="isoko-inbox">
            {!data ? (
              <Skeleton active style={{ padding: 12 }} />
            ) : data.tickets.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No requests here." style={{ padding: '32px 0' }} />
            ) : (
              data.tickets.map((tk) => <TicketRow key={tk.id} ticket={tk} active={tk.id === selected} onClick={() => setSelected(tk.id)} />)
            )}
          </Card>
        </Col>
        <Col xs={24} lg={15} style={{ display: stacked && !selected ? 'none' : undefined }}>
          {selected ? (
            <TicketDetail
              key={selected}
              id={selected}
              admins={data?.admins ?? []}
              saved={saved}
              onChanged={() => {
                load();
                loadSaved();
              }}
              onBack={stacked ? () => setSelected(null) : undefined}
            />
          ) : (
            <Card>
              <Flex vertical align="center" gap={8} style={{ padding: '48px 0' }}>
                <InboxOutlined style={{ fontSize: 36, color: 'var(--isoko-muted)' }} />
                <Typography.Text type="secondary">Select a request to read it.</Typography.Text>
              </Flex>
            </Card>
          )}
        </Col>
      </Row>

      <SavedRepliesModal open={manage} replies={saved} onClose={() => setManage(false)} onChanged={loadSaved} />
    </PageContainer>
  );
};

export default AdminSupport;
