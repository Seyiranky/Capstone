import { channelsFor } from '../../src/lib/channels/policy';
import type { NotificationCategory } from '../../src/types/domain';

describe('channelsFor', () => {
  // The regression guard for every call site that does not name a category:
  // if this list ever grows, un-annotated notifications silently start
  // texting and emailing, and on a live gateway every text is billed.
  it('keeps un-annotated notifications in the app', () => {
    expect(channelsFor()).toEqual(['in_app']);
    expect(channelsFor(undefined)).toEqual(['in_app']);
    expect(channelsFor('activity')).toEqual(['in_app']);
  });

  it('adds SMS and email for notices about an outcome or something critical', () => {
    for (const category of ['outcome', 'critical'] as const) {
      expect(channelsFor(category)).toContain('sms');
      expect(channelsFor(category)).toContain('email');
    }
  });

  it('keeps in-app on every category, since it is never opted out of', () => {
    const categories: NotificationCategory[] = ['activity', 'outcome', 'critical'];
    for (const category of categories) {
      expect(channelsFor(category)).toContain('in_app');
    }
  });

  it('falls back to activity for a value that is not a category', () => {
    // Reachable only if a category reaches notify() from untyped data, e.g. an
    // older queued payload. Failing closed means it gains no paid channel.
    expect(channelsFor('nonsense' as NotificationCategory)).toEqual(['in_app']);
  });
});
