import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DislikeOutlined, LikeOutlined, RightOutlined } from '@ant-design/icons';
import ContactFab from '../components/Support/ContactFab';
import { articlePath, articlesFor } from '../components/Support/helpContent';
import { useContactSupport } from '../components/Support/useContactSupport';
import { SUPPORT_CATEGORIES, type SupportCategory } from '../api/supportApi';

/** One answer, with "did this help?" and the rest of its topic. */
const SupportArticlePage = () => {
  const { t } = useTranslation();
  const { category, n } = useParams<{ category: SupportCategory; n: string }>();
  const [vote, setVote] = useState<'yes' | 'no' | null>(null);
  const contact = useContactSupport();
  if (!category || !SUPPORT_CATEGORIES.includes(category)) return <Navigate to="/support" replace />;
  const articles = articlesFor(t, category);
  const article = articles.find((a) => a.n === Number(n));
  if (!article) return <Navigate to={`/support/topics/${category}`} replace />;
  const others = articles.filter((a) => a.n !== article.n);
  const ask = () => contact.open({ category, subject: article.title });

  return (
    <div className="isoko-hc isoko-hc--narrow" key={`${category}-${n}`}>
      <nav className="isoko-hc-crumbs" aria-label="breadcrumb">
        <Link to="/support">{t('support.allTopics')}</Link>
        <RightOutlined />
        <Link to={`/support/topics/${category}`}>{t(`support.cat_${category}`)}</Link>
      </nav>

      <article className="isoko-hc-article">
        <h1 className="isoko-hc-title isoko-hc-title--sm">{article.title}</h1>
        <p>{article.body}</p>
      </article>

      <div className="isoko-hc-feedback">
        {vote === null ? (
          <>
            <span>{t('support.wasHelpful')}</span>
            <div>
              <button type="button" className="isoko-hc-chip" onClick={() => setVote('yes')}>
                <LikeOutlined /> {t('support.yes')}
              </button>
              <button type="button" className="isoko-hc-chip" onClick={() => setVote('no')}>
                <DislikeOutlined /> {t('support.no')}
              </button>
            </div>
          </>
        ) : vote === 'yes' ? (
          <span>{t('support.thanksFeedback')}</span>
        ) : (
          <>
            <span>{t('support.sorryFeedback')}</span>
            <button type="button" className="isoko-hc-button" onClick={ask}>
              {t('support.contactUs')}
            </button>
          </>
        )}
      </div>

      {others.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <h2 className="isoko-hc-subtitle">{t('support.moreIn', { topic: t(`support.cat_${category}`) })}</h2>
          <div className="isoko-hc-list">
            {others.map((a) => (
              <Link key={a.n} to={articlePath(a)} className="isoko-hc-list__item">
                <span>
                  <strong>{a.title}</strong>
                </span>
                <RightOutlined />
              </Link>
            ))}
          </div>
        </section>
      )}

      <ContactFab onClick={ask} />
      {contact.modal}
    </div>
  );
};

export default SupportArticlePage;
