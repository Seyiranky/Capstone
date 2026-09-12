const { Skill } = require('../models');

exports.listSkills = async (req, res) => {
  const where = req.query.category ? { category: req.query.category } : undefined;
  const skills = await Skill.findAll({ where, order: [['category', 'ASC'], ['name', 'ASC']] });
  res.json(skills);
};

exports.getSkill = async (req, res) => {
  const skill = await Skill.findByPk(req.params.id);
  if (!skill) {
    return res.status(404).json({ message: 'Skill not found' });
  }
  res.json(skill);
};
