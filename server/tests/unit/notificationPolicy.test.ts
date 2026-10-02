import { channelsFor } from '../../src/lib/channels/policy';
import type { NotificationCategory } from '../../src/types/domain';

describe('channelsFor', () => {
  // The regression guard for every call site that does not name a category:
  // this list is what notify() defaulted to before email existed, so if it
  // ever changes, un-annotated notifications silently start emailing.
  it('defaults to the channels notifications used before email existed', () => {
    expect(channelsFor()).toEqual(['in_app', 'sms']);
    expect(channelsFor(undefined)).toEqual(['in_app', 'sms']);
    expect(channelsFor('activity')).toEqual(['in_app', 'sms']);
  });

  it('adds email for notices about an outcome or something critical', () => {
    expect(channelsFor('outcome')).toContain('email');
    expect(channelsFor('critical')).toContain('email');
  });

  it('keeps in-app on every category, since it is never opted out of', () => {
    const categories: NotificationCategory[] = ['activity', 'outcome', 'critical'];
    for (const category of categories) {
      expect(channelsFor(category)).toContain('in_app');
    }
  });

  it('falls back to activity for a value that is not a category', () => {
    // Reachable only if a category reaches notify() from untyped data, e.g. an
    // older queued payload. Failing closed means it does not gain email.
    expect(channelsFor('nonsense' as NotificationCategory)).toEqual(['in_app', 'sms']);
  });
});
