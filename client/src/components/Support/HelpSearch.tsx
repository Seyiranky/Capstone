import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CloseOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { articlePath, searchArticles } from './helpContent';
import { CATEGORY_META } from './supportUi';

/**
 * The help centre's search: results open in a panel over the page as you type.
 * Arrow keys move through them, Enter opens one, Escape closes the panel.
 */
const HelpSearch = ({ onContact }: { onContact: () => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchArticles(t, query).slice(0, 6), [t, query]);
  const showing = open && query.trim().length > 1;

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  useEffect(() => setActive(0), [query]);

  const go = (i: number) => {
    const a = results[i];
    if (a) navigate(articlePath(a));
  };

  return (
    <div className="isoko-hc-search" ref={box}>
      <div className="isoko-hc-search__field">
        <SearchOutlined className="isoko-hc-search__icon" />
        <input
          ref={input}
          value={query}
          placeholder={t('support.searchPlaceholder')}
          aria-label={t('support.searchPlaceholder')}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
            if (e.key === 'Enter') go(active);
          }}
        />
        {query && (
          <button
            type="button"
            className="isoko-hc-search__clear"
            aria-label={t('support.clearSearch')}
            onClick={() => {
              setQuery('');
              input.current?.focus();
            }}
          >
            <CloseOutlined />
          </button>
        )}
      </div>

      {showing && (
        <div className="isoko-hc-results" role="listbox">
          {results.length === 0 ? (
            <div className="isoko-hc-results__empty">
              <p>
                {t('support.noArticles')} <strong>{query.trim()}</strong>
              </p>
              <button type="button" className="isoko-hc-link" onClick={onContact}>
                {t('support.askTeam')} <RightOutlined />
              </button>
            </div>
          ) : (
            results.map((a, i) => (
              <button
                key={`${a.category}-${a.n}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`isoko-hc-result${i === active ? ' isoko-hc-result--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(i)}
              >
                <span className="isoko-hc-result__icon">{CATEGORY_META[a.category].icon}</span>
                <span className="isoko-hc-result__text">
                  <strong>{a.title}</strong>
                  <span>
                    {t(`support.cat_${a.category}`)} · {a.body}
                  </span>
                </span>
                <RightOutlined className="isoko-hc-result__chev" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default HelpSearch;
