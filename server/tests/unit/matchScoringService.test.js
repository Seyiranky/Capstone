const matchScoringService = require('../../services/matchScoringService');

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

const worker = (overrides = {}) => ({
  id: 'worker-1',
  locationLat: GIG.locationLat,
  locationLng: GIG.locationLng,
  trustScore: 4,
  reviewCount: 5,
  ...overrides,
});

const verified = { verificationStatus: 'verified' };

const score = (args) =>
  matchScoringService.scorePair({
    gig: GIG,
    profile: BALANCED,
    workerSkill: verified,
    activeMatches: 0,
    ...args,
  });

const componentValue = (result, key) =>
  result.components.find((component) => component.key === key).value;

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

describe('skill fit', () => {
  test('verified outranks pending outranks claimed outranks absent', () => {
    const fit = (workerSkill) => componentValue(score({ worker: worker(), workerSkill }), 'skillFit');
    expect(fit({ verificationStatus: 'verified' })).toBeGreaterThan(
      fit({ verificationStatus: 'pending' }),
    );
    expect(fit({ verificationStatus: 'pending' })).toBeGreaterThan(
      fit({ verificationStatus: 'unverified' }),
    );
    expect(fit(null)).toBe(0);
  });

  test('a worker without the skill can still apply but is never invited', () => {
    const result = score({ worker: worker(), workerSkill: null });
    expect(result.eligibleForInvite).toBe(false);
    expect(result.reasons.map((r) => r.key)).toContain('match.reason.skill.absent');
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

  const rank = (profile) => {
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
