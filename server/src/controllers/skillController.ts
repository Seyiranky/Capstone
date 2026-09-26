import type { Request, Response } from 'express';
import type { Order, WhereOptions } from 'sequelize';
import { Skill } from '../models';
import { pathParam, stringParam } from '../lib/query';

const ORDER: Order = [
  ['category', 'ASC'],
  ['sortOrder', 'ASC'],
  ['name', 'ASC'],
];

/**
 * Lists skills.
 *
 * Defaults to categories only, which is what every existing caller expects —
 * returning the full flat list would turn a four-item dropdown into a
 * twenty-six item one without anyone asking. `?tree=1` returns categories with
 * their specialisations nested, in one call, for a cascading picker.
 */
export const listSkills = async (req: Request, res: Response): Promise<void> => {
  const category = stringParam(req, 'category');
  const tree = stringParam(req, 'tree');
  const parentId = stringParam(req, 'parentId');

  if (tree === '1' || tree === 'true') {
    const skills = await Skill.findAll({
      where: category ? { category } : undefined,
      order: ORDER,
    });
    const byParent = skills.reduce<Record<string, Skill[]>>((map, skill) => {
      if (!skill.parentId) return map;
      (map[skill.parentId] = map[skill.parentId] || []).push(skill);
      return map;
    }, {});

    res.json(
      skills
        .filter((skill) => !skill.parentId)
        .map((parent) => ({ ...parent.toJSON(), children: byParent[parent.id] || [] })),
    );
    return;
  }

  const where: WhereOptions<Skill> & { category?: string; parentId?: string | null } = {};
  if (category) where.category = category;
  if (parentId) {
    where.parentId = parentId;
  } else {
    where.parentId = null;
  }

  const skills = await Skill.findAll({ where, order: ORDER });
  res.json(skills);
};

export const getSkill = async (req: Request, res: Response): Promise<void> => {
  const skill = await Skill.findByPk(pathParam(req, 'id'), {
    include: [
      { model: Skill, as: 'parent', attributes: ['id', 'name', 'category'] },
      { model: Skill, as: 'children', attributes: ['id', 'name', 'sortOrder'] },
    ],
    order: [[{ model: Skill, as: 'children' }, 'sortOrder', 'ASC']],
  });
  if (!skill) {
    res.status(404).json({ message: 'Skill not found' });
    return;
  }
  res.json(skill);
};
