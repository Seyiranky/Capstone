import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { ExperimentAllocation, sequelize } from '../models';
import type { ExperimentArm } from '../types/domain';

const EXPERIMENT = 'rq3_provenance';
const ARMS: ExperimentArm[] = ['provenance', 'plain'];

// Mixed block sizes on purpose. With a fixed size, the last entry of every
// block is deducible from the ones before it, so whoever registers
// participants could predict it. Mixing 2 and 4 removes that foothold while
// still bounding imbalance at half a block.
const BLOCK_SIZES = [2, 4];

/** One position in the generated sequence, before it is written to the table. */
export interface AllocationRow {
  experiment: string;
  position: number;
  blockIndex: number;
  blockSize: number;
  arm: ExperimentArm;
  seed: string;
}

export interface AllocationStatus {
  experiment: string;
  seed: string | null;
  total: number;
  claimed: number;
  remaining: number;
  byArm: Record<ExperimentArm, number>;
  imbalance: number;
  exhausted: boolean;
}

/**
 * Deterministic pseudo-random stream from a seed.
 *
 * Seeded rather than Math.random so the published sequence can be regenerated
 * from the seed alone and checked against what the pilot actually used.
 */
const streamFrom = (seed: string): (() => number) => {
  let counter = 0;
  let buffer = Buffer.alloc(0);
  let offset = 0;

  return () => {
    if (offset + 4 > buffer.length) {
      buffer = crypto.createHash('sha256').update(`${seed}:${counter}`).digest();
      counter += 1;
      offset = 0;
    }
    const value = buffer.readUInt32BE(offset);
    offset += 4;
    return value / 0xffffffff;
  };
};

const shuffle = <T>(items: T[], next: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Builds a permuted-block allocation sequence.
 *
 * Every block holds equal numbers of each arm in random order, so the arms
 * cannot drift apart by more than half a block however many participants
 * actually enrol — which matters when the target is roughly a dozen clients
 * and a lopsided split would leave the comparison with little power.
 */
export const generateSequence = (
  length: number,
  seed: string = crypto.randomUUID(),
): { seed: string; rows: AllocationRow[] } => {
  const next = streamFrom(seed);
  const rows: AllocationRow[] = [];
  let blockIndex = 0;

  while (rows.length < length) {
    const blockSize = BLOCK_SIZES[Math.floor(next() * BLOCK_SIZES.length)];
    const half = blockSize / 2;
    const block = shuffle([...Array(half).fill(ARMS[0]), ...Array(half).fill(ARMS[1])], next);

    for (const arm of block) {
      if (rows.length >= length) break;
      rows.push({
        experiment: EXPERIMENT,
        position: rows.length,
        blockIndex,
        blockSize,
        arm,
        seed,
      });
    }
    blockIndex += 1;
  }

  return { seed, rows };
};

/**
 * Claims the next unassigned arm for a user.
 *
 * The row is locked and marked in one transaction, so two people registering
 * at the same moment cannot take the same position — the failure mode a
 * count-then-write approach has, which silently breaks the balance it exists
 * to guarantee.
 *
 * Returns null when the list is exhausted; the caller decides what that means
 * rather than having an arm invented for them.
 */
export const claimArm = async (userId: string): Promise<ExperimentArm | null> => {
  return sequelize.transaction(async (transaction) => {
    const [row] = await sequelize.query<{ id: string }>(
      `SELECT id FROM "ExperimentAllocations"
       WHERE "experiment" = :experiment AND "claimedByUserId" IS NULL
       ORDER BY "position" ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      {
        replacements: { experiment: EXPERIMENT },
        type: QueryTypes.SELECT,
        transaction,
      },
    );

    if (!row) return null;

    const allocation = await ExperimentAllocation.findByPk(row.id, { transaction });
    if (!allocation) return null;
    await allocation.update({ claimedByUserId: userId, claimedAt: new Date() }, { transaction });
    return allocation.arm;
  });
};

/** Where the sequence stands, for the metrics endpoint and the write-up. */
export const status = async (): Promise<AllocationStatus> => {
  const rows = await ExperimentAllocation.findAll({
    where: { experiment: EXPERIMENT },
    order: [['position', 'ASC']],
  });

  const claimed = rows.filter((r) => r.claimedByUserId);
  const byArm = ARMS.reduce(
    (acc, arm) => {
      acc[arm] = claimed.filter((r) => r.arm === arm).length;
      return acc;
    },
    {} as Record<ExperimentArm, number>,
  );

  return {
    experiment: EXPERIMENT,
    seed: rows[0]?.seed ?? null,
    total: rows.length,
    claimed: claimed.length,
    remaining: rows.length - claimed.length,
    byArm,
    // Never exceeds half a block if the list was generated by this service.
    imbalance: Math.abs((byArm[ARMS[0]] ?? 0) - (byArm[ARMS[1]] ?? 0)),
    exhausted: rows.length > 0 && claimed.length === rows.length,
  };
};

export { EXPERIMENT, ARMS, BLOCK_SIZES };
