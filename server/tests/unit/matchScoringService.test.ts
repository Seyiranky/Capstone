import * as matchScoringService from '../../src/services/matchScoringService';
import type { Provenance, VerificationStatus } from '../../src/types/domain';

// Kimironko, one of the two pilot sectors.
const GIG = {
  id: 'gig-1',
  skillId: 'skill-tailoring',
  locationLat: -1.9536,
  locationLng: 30.1044,
};

const BALANCED = {
  id: 'profile-balanced',
  name: 'balanced',
  weights: { distance: 0.3, trust: 0.3, skillFit: 0.3, availability: 0.1 },
  distanceHalfLifeKm: 3,
  maxDistanceKm: 15,
};

const PROXIMITY_FIRST = {
  ...BALANCED,
  id: 'profile-proximity',
  name: 'proximity_first',
  weights: { distance: 0.5, trust: 0.2, skillFit: 0.25, availability: 0.05 },
};

const TRUST_FIRST = {
  ...BALANCED,
  id: 'profile-trust',
  name: 'trust_first',
  weights: { distance: 0.2, trust: 0.5, skillFit: 0.25, availability: 0.05 },
};

const worker = (overrides: any = {}) => ({
  id: 'worker-1',
  locationLat: GIG.locationLat,
  locationLng: GIG.locationLng,
  trustScore: 4,
  reviewCount: 5,
  ...overrides,
});

// The gig asks for one specialisation beneath a category, which is what lets
// exact / sibling / category-only matching be told apart.
const GIG_SKILL = { id: 'skill-bridal', name: 'Bridal & occasion wear', parentId: 'cat-tailoring' };
const SIBLING_SKILL = { id: 'skill-uniforms', name: 'School uniforms', parentId: 'cat-tailoring' };
const CATEGORY_SKILL = { id: 'cat-tailoring', name: 'Tailoring', parentId: null };
const UNRELATED_SKILL = { id: 'skill-laptops', name: 'Laptop repair', parentId: 'cat-electronics' };

/** A worker's skill row as the scorer receives it, with its Skill included. */
const userSkill = (
  skill: { id: string; name: string; parentId: string | null },
  // Partial rather than a loose record: spreading `unknown` values would widen
  // every field and stop the result satisfying the scorer's input type.
  overrides: Partial<{
    verificationStatus: VerificationStatus;
    proficiencyLevel: number;
    credentialStrength: number;
    provenance: Provenance;
  }> = {},
) => ({
  skillId: skill.id,
  skill,
  // Annotated rather than inferred: a bare string literal widens to `string`
  // and stops satisfying the VerificationStatus union the scorer expects.
  verificationStatus: 'verified' as VerificationStatus,
  proficiencyLevel: 3,
  ...overrides,
});

const verified = userSkill(GIG_SKILL);

const score = (args: any) =>
  matchScoringService.scorePair({
    gig: GIG,
    gigSkill: GIG_SKILL,
    profile: BALANCED,
    workerSkill: verified,
    activeMatches: 0,
    ...args,
  });

const componentValue = (result: any, key: any) =>
  result.components.find((component: any) => component.key === key).value;

describe('distance scoring', () => {
  test('a worker at the gig location scores a perfect proximity value', () => {
    const result = score({ worker: worker() });
    expect(componentValue(result, 'distance')).toBeCloseTo(1, 5);
    expect(result.distanceKm).toBeCloseTo(0, 2);
  });

  test('proximity halves at the configured half-life distance', () => {
    // ~3km due north of the gig (1 degree of latitude is ~111.32km).
    const result = score({
      worker: worker({ locationLat: GIG.locationLat + 3 / 111.32 }),
    });
    expect(result.distanceKm).toBeCloseTo(3, 1);
    expect(componentValue(result, 'distance')).toBeCloseTo(0.5, 1);
  });

  test('proximity decays geometrically, not linearly', () => {
    const at3km = score({ worker: worker({ locationLat: GIG.locationLat + 3 / 111.32 }) });
    const at6km = score({ worker: worker({ locationLat: GIG.locationLat + 6 / 111.32 }) });
    expect(componentValue(at6km, 'distance')).toBeCloseTo(0.25, 1);
    // Linear decay would put 6km at zero; geometric decay keeps it in play.
    expect(componentValue(at6km, 'distance')).toBeGreaterThan(0);
    expect(componentValue(at3km, 'distance')).toBeGreaterThan(componentValue(at6km, 'distance'));
  });

  test('a worker beyond the maximum radius is excluded from invitations', () => {
    const result = score({
      worker: worker({ locationLat: GIG.locationLat + 40 / 111.32 }),
    });
    expect(result.beyondRange).toBe(true);
    expect(result.eligibleForInvite).toBe(false);
  });

  test('a worker with no saved location is scored neutrally, not zero', () => {
    const result = score({ worker: worker({ locationLat: null, locationLng: null }) });
    expect(componentValue(result, 'distance')).toBe(0.5);
    expect(result.distanceKm).toBeNull();
    expect(result.reasons.map((r) => r.key)).toContain('match.reason.noLocation');
  });
});

const fitFor = (workerSkill: any, gigOverrides = {}) =>
  componentValue(
    score({ worker: worker(), workerSkill, gig: { ...GIG, ...gigOverrides } }),
    'skillFit',
  );

describe('skill fit', () => {
  test('verified outranks pending outranks claimed outranks absent', () => {
    expect(fitFor(userSkill(GIG_SKILL, { verificationStatus: 'verified' }))).toBeGreaterThan(
      fitFor(userSkill(GIG_SKILL, { verificationStatus: 'pending' })),
    );
    expect(fitFor(userSkill(GIG_SKILL, { verificationStatus: 'pending' }))).toBeGreaterThan(
      fitFor(userSkill(GIG_SKILL, { verificationStatus: 'unverified' })),
    );
    expect(fitFor(null)).toBe(0);
  });

  test('a worker without the skill can still apply but is never invited', () => {
    const result = score({ worker: worker(), workerSkill: null });
    expect(result.eligibleForInvite).toBe(false);
    expect(result.reasons.map((r) => r.key)).toContain('match.reason.skill.absent');
  });
});

describe('specialisation matching', () => {
  test('the exact specialisation beats a sibling, which beats the category alone', () => {
    const exact = fitFor(userSkill(GIG_SKILL));
    const sibling = fitFor(userSkill(SIBLING_SKILL));
    const categoryOnly = fitFor(userSkill(CATEGORY_SKILL));

    expect(exact).toBeGreaterThan(sibling);
    expect(sibling).toBeGreaterThan(categoryOnly);
    expect(categoryOnly).toBeGreaterThan(0);
  });

  test('a sibling specialisation is still a real candidate, not an exclusion', () => {
    const result = score({ worker: worker(), workerSkill: userSkill(SIBLING_SKILL) });
    expect(result.eligibleForInvite).toBe(true);
    expect(result.reasons.map((r) => r.key)).toContain('match.reason.relatedSpecialisation');
  });

  test('a skill from another category does not match at all', () => {
    const result = score({ worker: worker(), workerSkill: userSkill(UNRELATED_SKILL) });
    expect(componentValue(result, 'skillFit')).toBe(0);
    expect(result.eligibleForInvite).toBe(false);
  });
});

describe('proficiency level', () => {
  test('level now separates two otherwise identical verified workers', () => {
    // Until this change a level-5 and a level-1 verified worker ranked the same.
    const high = fitFor(userSkill(GIG_SKILL, { proficiencyLevel: 5 }));
    const low = fitFor(userSkill(GIG_SKILL, { proficiencyLevel: 1 }));
    expect(high).toBeGreaterThan(low);
  });

  test('meeting a stated requirement scores full marks, falling short is proportional', () => {
    const meets = fitFor(userSkill(GIG_SKILL, { proficiencyLevel: 4 }), { requiredLevel: 4 });
    const under = fitFor(userSkill(GIG_SKILL, { proficiencyLevel: 2 }), { requiredLevel: 4 });
    expect(meets).toBeCloseTo(1, 5);
    expect(under).toBeCloseTo(0.5, 5);
  });

  test('exceeding the requirement is not rewarded beyond meeting it', () => {
    const meets = fitFor(userSkill(GIG_SKILL, { proficiencyLevel: 4 }), { requiredLevel: 4 });
    const exceeds = fitFor(userSkill(GIG_SKILL, { proficiencyLevel: 5 }), { requiredLevel: 4 });
    expect(exceeds).toBeCloseTo(meets, 5);
  });

  test('an unset requirement penalises nobody', () => {
    const result = score({ worker: worker(), gig: { ...GIG, requiredLevel: null } });
    expect(componentValue(result, 'skillFit')).toBeGreaterThan(0);
    expect(result.reasons.map((r) => r.key)).not.toContain('match.reason.levelBelow');
  });

  test('a self-declared level cannot clear a client requirement', () => {
    // Otherwise a worker awards themselves level 5, clears every bar, and the
    // field stops carrying information within a week.
    const selfDeclared = fitFor(
      userSkill(GIG_SKILL, { verificationStatus: 'unverified', proficiencyLevel: 5 }),
      { requiredLevel: 4 },
    );
    const honestBeginner = fitFor(
      userSkill(GIG_SKILL, { verificationStatus: 'unverified', proficiencyLevel: 1 }),
      { requiredLevel: 4 },
    );
    expect(selfDeclared).toBeCloseTo(honestBeginner, 10);
  });

  test('a client is told when a worker falls below the bar they set', () => {
    const result = score({
      worker: worker(),
      workerSkill: userSkill(GIG_SKILL, { proficiencyLevel: 2 }),
      gig: { ...GIG, requiredLevel: 5 },
    });
    const keys = result.reasons.map((r) => r.key);
    expect(keys).toContain('match.reason.levelBelow');
    // Down-ranked, never hidden.
    expect(result.eligibleForInvite).toBe(true);
  });
});

describe('availability', () => {
  test('availability falls as a worker takes on concurrent jobs', () => {
    const free = componentValue(score({ worker: worker(), activeMatches: 0 }), 'availability');
    const one = componentValue(score({ worker: worker(), activeMatches: 1 }), 'availability');
    const two = componentValue(score({ worker: worker(), activeMatches: 2 }), 'availability');
    expect(free).toBe(1);
    expect(one).toBe(0.5);
    expect(two).toBe(0);
  });
});

describe('weight profiles (RQ2)', () => {
  const near = worker({ id: 'near-untrusted', trustScore: 2, reviewCount: 4 });
  const far = worker({
    id: 'far-trusted',
    trustScore: 5,
    reviewCount: 20,
    locationLat: GIG.locationLat + 8 / 111.32,
  });

  const rank = (profile: any) => {
    const results = [near, far].map((w) =>
      matchScoringService.scorePair({
        worker: w,
        gig: GIG,
        profile,
        workerSkill: verified,
        activeMatches: 0,
      }),
    );
    return results.sort((a, b) => b.score - a.score).map((r) => r.workerId);
  };

  test('proximity-first ranks the nearby worker above the distant trusted one', () => {
    expect(rank(PROXIMITY_FIRST)[0]).toBe('near-untrusted');
  });

  test('trust-first reverses that ranking on identical data', () => {
    expect(rank(TRUST_FIRST)[0]).toBe('far-trusted');
  });

  test('the weighting used is frozen onto each result for reproducibility', () => {
    const result = score({ worker: worker(), profile: TRUST_FIRST });
    expect(result.weightProfile.name).toBe('trust_first');
    expect(result.weightProfile.weights).toEqual(TRUST_FIRST.weights);
  });
});

describe('explainability', () => {
  test('reasons are i18n keys with parameters, never rendered sentences', () => {
    const result = score({ worker: worker() });
    for (const reason of result.reasons) {
      expect(reason.key).toMatch(/^match\.reason\./);
      expect(reason).toHaveProperty('params');
      expect(reason).not.toHaveProperty('text');
    }
  });

  test('an unrated worker is described as provisional rather than low-trust', () => {
    const result = score({ worker: worker({ trustScore: 0, reviewCount: 0 }) });
    expect(result.reasons.map((r) => r.key)).toContain('match.reason.trustProvisional');
    expect(result.reasons.map((r) => r.key)).not.toContain('match.reason.trust');
  });

  test('component contributions sum to the reported score', () => {
    const result = score({ worker: worker({ trustScore: 3.5 }), activeMatches: 1 });
    const summed = result.components.reduce((total, c) => total + c.contribution, 0);
    expect(summed).toBeCloseTo(result.score, 10);
  });
});
