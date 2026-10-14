import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Collapse, Empty, Flex, Input, Skeleton, Typography } from 'antd';
import { CustomerServiceOutlined, PlusOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import PageContainer from '../components/Layout/PageContainer';
import ContactSupportModal, { type ContactPrefill } from '../components/Support/ContactSupportModal';
import { CategoryIcon, StatusPill } from '../components/Support/supportUi';
import { SUPPORT_CATEGORIES, supportApi, type SupportCategory, type SupportRelatedType, type SupportTicket } from '../api/supportApi';
import { fromNow } from '../lib/time';

type Faq = Record<SupportCategory, Record<string, string>>;

/**
 * Help & support: answers first, then a way to reach the team, then the
 * person's own requests. A link can open the form already filled in, e.g.
 * /support?new=1&category=payment&type=transaction&id=…
 */
const SupportPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [topic, setTopic] = useState<SupportCategory | null>((params.get('category') as SupportCategory) || null);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');

  const prefill = useMemo<ContactPrefill>(
    () => ({
      category: (params.get('category') as SupportCategory) || topic || undefined,
      relatedType: (params.get('type') as SupportRelatedType) || undefined,
      relatedId: params.get('id') || undefined,
      subject: params.get('subject') || undefined,
      from: params.get('from') || undefined,
    }),
    [params, topic],
  );

  useEffect(() => {
    supportApi.list().then(setTickets).catch(() => setTickets([]));
  }, []);

  const faq = t('support.faq', { returnObjects: true }) as Faq;
  const entries = (c: SupportCategory) =>
    [1, 2, 3].map((i) => ({ category: c, q: faq[c]?.[`q${i}`] ?? '', a: faq[c]?.[`a${i}`] ?? '' })).filter((e) => e.q);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return null;
    return SUPPORT_CATEGORIES.flatMap(entries).filter((e) => `${e.q} ${e.a}`.toLowerCase().includes(needle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, faq]);

  const openForm = (category?: SupportCategory | null) => {
    if (category) setTopic(category);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    if (params.get('new')) setParams({}, { replace: true });
  };

  const answers = (list: { q: string; a: string }[]) => (
    <Collapse
      bordered={false}
      className="isoko-faq"
      items={list.map((e, i) => ({ key: String(i), label: e.q, children: <Typography.Paragraph style={{ margin: 0 }}>{e.a}</Typography.Paragraph> }))}
    />
  );

  return (
    <PageContainer title={t('support.title')} subtitle={t('support.subtitle')}>
      <div className="isoko-help-hero">
        <div className="isoko-help-hero__icon">
          <CustomerServiceOutlined />
        </div>
        <Typography.Title level={3} style={{ margin: '12px 0 6px' }}>
          {t('support.heroTitle')}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ maxWidth: 520, margin: '0 auto 18px' }}>
          {t('support.heroBody')}
        </Typography.Paragraph>
        <Input
          size="large"
          allowClear
          prefix={<SearchOutlined style={{ color: 'var(--isoko-muted)' }} />}
          placeholder={t('support.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 520 }}
        />
      </div>

      {results ? (
        <Card style={{ marginTop: 16 }}>
          {results.length ? answers(results) : <Typography.Text type="secondary">{t('support.searchNoResults')}</Typography.Text>}
          <Flex justify="flex-end" style={{ marginTop: 12 }}>
            <Button type="primary" onClick={() => openForm(topic)}>{t('support.contactUs')}</Button>
          </Flex>
        </Card>
      ) : (
        <>
          <Typography.Title level={5} style={{ margin: '24px 0 12px' }}>
            {t('support.categoriesTitle')}
          </Typography.Title>
          <div className="isoko-help-topics">
            {SUPPORT_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`isoko-help-topic${topic === c ? ' isoko-help-topic--on' : ''}`}
                aria-pressed={topic === c}
                onClick={() => setTopic(topic === c ? null : c)}
              >
                <CategoryIcon category={c} size={40} />
                <span className="isoko-help-topic__text">
                  <strong>{t(`support.cat_${c}`)}</strong>
                  <span>{t(`support.catHint_${c}`)}</span>
                </span>
                <RightOutlined className="isoko-help-topic__chev" />
              </button>
            ))}
          </div>

          {topic && (
            <Card
              style={{ marginTop: 16 }}
              title={
                <Flex align="center" gap={10}>
                  <CategoryIcon category={topic} size={28} />
                  {t('support.quickAnswers')}: {t(`support.cat_${topic}`)}
                </Flex>
              }
            >
              {topic === 'safety' && (
                <Typography.Paragraph strong style={{ color: '#e11d48' }}>
                  {t('support.safetyNow')}
                </Typography.Paragraph>
              )}
              {answers(entries(topic))}
              <div className="isoko-help-cta">
                <div>
                  <Typography.Text strong>{t('support.stillNeedHelp')}</Typography.Text>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                    {t('support.contactCta')}
                  </Typography.Text>
                </div>
                <Button type="primary" onClick={() => openForm(topic)}>
                  {t('support.contactUs')}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      <Card
        style={{ marginTop: 24 }}
        title={t('support.myRequests')}
        extra={
          <Button icon={<PlusOutlined />} onClick={() => openForm(topic)}>
            {t('support.newRequest')}
          </Button>
        }
        styles={{ body: { padding: tickets && tickets.length ? 6 : 24 } }}
      >
        {!tickets ? (
          <Skeleton active />
        ) : tickets.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('support.noRequests')} />
        ) : (
          tickets.map((tk) => (
            <button key={tk.id} type="button" className="isoko-ticket-row" onClick={() => navigate(`/support/${tk.id}`)}>
              <CategoryIcon category={tk.category} size={34} />
              <span className="isoko-ticket-row__main">
                <span className="isoko-ticket-row__subject">
                  {tk.userUnread && <span className="isoko-ticket-row__dot" aria-label={t('support.newReply')} />}
                  {tk.subject}
                </span>
                <span className="isoko-ticket-row__meta">
                  {tk.number} · {t('support.lastUpdate', { time: fromNow(tk.lastMessageAt) })}
                </span>
              </span>
              <StatusPill status={tk.status} />
            </button>
          ))
        )}
      </Card>

      <ContactSupportModal
        open={formOpen}
        prefill={prefill}
        onClose={closeForm}
        onCreated={(ticket) => {
          closeForm();
          navigate(`/support/${ticket.id}`);
        }}
      />
    </PageContainer>
  );
};

export default SupportPage;
