import { Report, Skill, UserSkill } from '../models';
import type { Gig } from '../models/Gig';
import type { User } from '../models/User';

/**
 * Who may apply to a gig. These are rules, checked the same way for everyone,
 * instead of an admin approving each application: the client then chooses
 * among those who qualify.
 *
 * Every gig: an active account, a confirmed email or phone, and no open report
 * against the worker. A sensitive gig (children, inside a home) also needs a
 * reviewed skill in the trade, a confirmed phone, and a record: at least one
 * paid job or a trust score of 4.0 or more.
 */
export type IneligibleReason =
  | 'account_suspended'
  | 'contact_unconfirmed'
  | 'open_report'
  | 'sensitive_skill'
  | 'sensitive_phone'
  | 'sensitive_record';

export const SENSITIVE_MIN_TRUST = 4.0;

export interface Eligibility {
  eligible: boolean;
  sensitive: boolean;
  /** Every rule not met, so the worker can fix them all at once. */
  missing: IneligibleReason[];
}

export const canApply = async (gig: Gig, worker: User): Promise<Eligibility> => {
  const missing: IneligibleReason[] = [];
  if (worker.status !== 'active') missing.push('account_suspended');
  // The same switch as the requireConfirmedContact middleware: off in the test
  // suite unless a test turns it on, so fixtures need not confirm a contact.
  const contactGate = process.env.NODE_ENV !== 'test' || process.env.CONTACT_GATE_IN_TESTS === '1';
  if (contactGate && !worker.emailVerifiedAt && !worker.phoneVerifiedAt) missing.push('contact_unconfirmed');
  if (await Report.count({ where: { reportedUserId: worker.id, status: 'open' } })) missing.push('open_report');

  if (gig.sensitive) {
    const trade = await Skill.findByPk(gig.skillId, { attributes: ['category'] });
    const reviewed = trade
      ? await UserSkill.count({
          where: { userId: worker.id, verificationStatus: 'verified' },
          include: [{ model: Skill, as: 'skill', where: { category: trade.category }, required: true }],
        })
      : 0;
    if (!reviewed) missing.push('sensitive_skill');
    if (!worker.phoneVerifiedAt) missing.push('sensitive_phone');
    if (worker.completedJobCount < 1 && !(worker.reviewCount > 0 && worker.trustScore >= SENSITIVE_MIN_TRUST)) {
      missing.push('sensitive_record');
    }
  }
  return { eligible: missing.length === 0, sensitive: gig.sensitive, missing };
};
