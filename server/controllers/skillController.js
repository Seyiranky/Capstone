const { Skill } = require('../models');

const ORDER = [
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
exports.listSkills = async (req, res) => {
  const { category, tree, parentId } = req.query;

  if (tree === '1' || tree === 'true') {
    const skills = await Skill.findAll({
      where: category ? { category } : undefined,
      order: ORDER,
    });
    const byParent = skills.reduce((map, skill) => {
      if (!skill.parentId) return map;
      (map[skill.parentId] = map[skill.parentId] || []).push(skill);
      return map;
    }, {});

    return res.json(
      skills
        .filter((skill) => !skill.parentId)
        .map((parent) => ({ ...parent.toJSON(), children: byParent[parent.id] || [] })),
    );
  }

  const where = {};
  if (category) where.category = category;
  if (parentId) {
    where.parentId = parentId;
  } else {
    where.parentId = null;
  }

  const skills = await Skill.findAll({ where, order: ORDER });
  res.json(skills);
};

exports.getSkill = async (req, res) => {
  const skill = await Skill.findByPk(req.params.id, {
    include: [
      { model: Skill, as: 'parent', attributes: ['id', 'name', 'category'] },
      { model: Skill, as: 'children', attributes: ['id', 'name', 'sortOrder'] },
    ],
    order: [[{ model: Skill, as: 'children' }, 'sortOrder', 'ASC']],
  });
  if (!skill) {
    return res.status(404).json({ message: 'Skill not found' });
  }
  res.json(skill);
};
