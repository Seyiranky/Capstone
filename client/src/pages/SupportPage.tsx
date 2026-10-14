import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CommentOutlined, InboxOutlined } from '@ant-design/icons';
import HelpSearch from '../components/Support/HelpSearch';
import ContactFab from '../components/Support/ContactFab';
import { CATEGORY_META } from '../components/Support/supportUi';
import { articlesFor } from '../components/Support/helpContent';
import { useContactSupport } from '../components/Support/useContactSupport';
import { SUPPORT_CATEGORIES, supportApi, type SupportCategory, type SupportRelatedType } from '../api/supportApi';

/**
 * The help centre's front page: a question, a search, and a card per topic,
 * plus the person's own requests and a way to write to the team. A link can
 * open the contact form already filled in: /support?new=1&category=payment&type=transaction&id=…
 */
const SupportPage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [requestCount, setRequestCount] = useState<number | null>(null);
  const contact = useContactSupport(() => {
    if (params.get('new')) setParams({}, { replace: true });
  });

  useEffect(() => {
    supportApi.list().then((r) => setRequestCount(r.length)).catch(() => setRequestCount(0));
  }, []);

  useEffect(() => {
    if (params.get('new') !== '1') return;
    contact.open({
      category: (params.get('category') as SupportCategory) || undefined,
      relatedType: (params.get('type') as SupportRelatedType) || undefined,
      relatedId: params.get('id') || undefined,
      subject: params.get('subject') || undefined,
      from: params.get('from') || undefined,
    });
    // Only when the address asks for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="isoko-hc">
      <section className="isoko-hc-hero">
        <h1 className="isoko-hc-title">{t('support.heroGreeting')}</h1>
        <HelpSearch onContact={() => contact.open()} />
      </section>

      <div className="isoko-hc-grid">
        {SUPPORT_CATEGORIES.map((c) => (
          <Link key={c} to={`/support/topics/${c}`} className="isoko-hc-card">
            <span className="isoko-hc-card__icon">{CATEGORY_META[c].icon}</span>
            <strong className="isoko-hc-card__title">{t(`support.cat_${c}`)}</strong>
            <span className="isoko-hc-card__text">{t(`support.catHint_${c}`)}</span>
            <span className="isoko-hc-card__meta">{t('support.articles', { count: articlesFor(t, c).length })}</span>
          </Link>
        ))}
        <Link to="/support/requests" className="isoko-hc-card">
          <span className="isoko-hc-card__icon">
            <InboxOutlined />
          </span>
          <strong className="isoko-hc-card__title">{t('support.myRequests')}</strong>
          <span className="isoko-hc-card__text">{t('support.requestsHint')}</span>
          <span className="isoko-hc-card__meta">
            {requestCount === null ? ' ' : t('support.requestsCount', { count: requestCount })}
          </span>
        </Link>
        <button type="button" className="isoko-hc-card isoko-hc-card--accent" onClick={() => contact.open()}>
          <span className="isoko-hc-card__icon">
            <CommentOutlined />
          </span>
          <strong className="isoko-hc-card__title">{t('support.contactCard')}</strong>
          <span className="isoko-hc-card__text">{t('support.contactCta')}</span>
          <span className="isoko-hc-card__meta">{t('support.replyTime')}</span>
        </button>
      </div>

      <ContactFab onClick={() => contact.open()} />
      {contact.modal}
    </div>
  );
};

export default SupportPage;
