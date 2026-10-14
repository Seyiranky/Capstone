import type { TFunction } from 'i18next';
import { SUPPORT_CATEGORIES, type SupportCategory } from '../../api/supportApi';

export interface HelpArticle {
  category: SupportCategory;
  /** 1-based, as it appears in the address: /support/topics/payment/2 */
  n: number;
  title: string;
  body: string;
}

/** The help articles, from the translation files so they follow the language. */
export const articlesFor = (t: TFunction, category: SupportCategory): HelpArticle[] => {
  const faq = t('support.faq', { returnObjects: true }) as Record<string, Record<string, string>>;
  const out: HelpArticle[] = [];
  for (let n = 1; faq[category]?.[`q${n}`]; n += 1) {
    out.push({ category, n, title: faq[category][`q${n}`], body: faq[category][`a${n}`] ?? '' });
  }
  return out;
};

export const allArticles = (t: TFunction) => SUPPORT_CATEGORIES.flatMap((c) => articlesFor(t, c));

// The words people type for things the articles name differently.
const SYNONYMS: Record<string, string[]> = {
  momo: ['mobile money', 'momo', 'mtn'],
  mtn: ['mobile money', 'mtn'],
  money: ['pay', 'money'],
  pay: ['pay', 'paid', 'payment'],
  paid: ['paid', 'pay'],
  pin: ['pin', 'approve'],
  otp: ['code'],
  code: ['code'],
  login: ['sign-in', 'sign in', 'password', 'log in'],
  signin: ['sign-in', 'sign in'],
  photo: ['picture', 'photo'],
  picture: ['picture', 'photo'],
  dispute: ['dispute', 'disagree'],
  sos: ['sos', 'unsafe', 'danger'],
  delete: ['delete', 'remove'],
};

/** Articles whose title or text contains every word of the query (or a word meaning the same). */
export const searchArticles = (t: TFunction, query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const forms = (w: string) => [w, ...(SYNONYMS[w.replace(/[^a-z]/g, '')] ?? [])];
  return allArticles(t)
    .map((a) => {
      const title = a.title.toLowerCase();
      const text = `${title} ${a.body.toLowerCase()}`;
      if (!words.every((w) => forms(w).some((f) => text.includes(f)))) return null;
      // Title matches first.
      return { a, score: words.filter((w) => forms(w).some((f) => title.includes(f))).length };
    })
    .filter((x): x is { a: HelpArticle; score: number } => x !== null)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
};

export const articlePath = (a: Pick<HelpArticle, 'category' | 'n'>) => `/support/topics/${a.category}/${a.n}`;
