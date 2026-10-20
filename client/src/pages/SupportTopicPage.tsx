import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RightOutlined } from '@ant-design/icons';
import ContactFab from '../components/Support/ContactFab';
import { CATEGORY_META } from '../components/Support/supportMeta';
import { articlePath, articlesFor } from '../components/Support/helpContent';
import { useContactSupport } from '../components/Support/useContactSupport';
import { SUPPORT_CATEGORIES, type SupportCategory } from '../api/supportApi';

/** One topic: its articles, and a way to ask the team about it. */
const SupportTopicPage = () => {
  const { t } = useTranslation();
  const { category } = useParams<{ category: SupportCategory }>();
  const contact = useContactSupport();
  if (!category || !SUPPORT_CATEGORIES.includes(category)) return <Navigate to="/support" replace />;
  const articles = articlesFor(t, category);

  return (
    <div className="isoko-hc isoko-hc--narrow">
      <nav className="isoko-hc-crumbs" aria-label="breadcrumb">
        <Link to="/support">{t('support.allTopics')}</Link>
        <RightOutlined />
        <span>{t(`support.cat_${category}`)}</span>
      </nav>
      <header className="isoko-hc-topic-head">
        <span className="isoko-hc-card__icon">{CATEGORY_META[category].icon}</span>
        <div>
          <h1 className="isoko-hc-title isoko-hc-title--sm">{t(`support.cat_${category}`)}</h1>
          <p>{t(`support.catHint_${category}`)} · {t('support.articles', { count: articles.length })}</p>
        </div>
      </header>
      {category === 'safety' && <div className="isoko-hc-alert">{t('support.safetyNow')}</div>}

      <div className="isoko-hc-list">
        {articles.map((a) => (
          <Link key={a.n} to={articlePath(a)} className="isoko-hc-list__item">
            <span>
              <strong>{a.title}</strong>
              <span>{a.body}</span>
            </span>
            <RightOutlined />
          </Link>
        ))}
      </div>

      <div className="isoko-hc-cta">
        <div>
          <strong>{t('support.didntFind')}</strong>
          <span>{t('support.contactCta')}</span>
        </div>
        <button type="button" className="isoko-hc-button" onClick={() => contact.open({ category })}>
          {t('support.contactUs')}
        </button>
      </div>

      <ContactFab onClick={() => contact.open({ category })} />
      {contact.modal}
    </div>
  );
};

export default SupportTopicPage;
