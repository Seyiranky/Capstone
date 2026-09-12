const { Op, fn, col } = require('sequelize');
const { User, SkillTask } = require('../models');

exports.assignReviewer = async (workerId) => {
  const admins = await User.findAll({ where: { role: 'admin' } });
  if (admins.length === 0) {
    return null;
  }

  const pendingCounts = await SkillTask.findAll({
    attributes: ['reviewerId', [fn('COUNT', col('id')), 'pendingCount']],
    where: { status: 'pending', reviewerId: { [Op.not]: null } },
    group: ['reviewerId'],
    raw: true,
  });
  const countByAdmin = new Map(pendingCounts.map((row) => [row.reviewerId, Number(row.pendingCount)]));

  const eligible = admins.filter((admin) => admin.id !== workerId);
  if (eligible.length === 0) {
    return null;
  }

  const loads = eligible.map((admin) => countByAdmin.get(admin.id) || 0);
  const minLoad = Math.min(...loads);
  const leastBusy = eligible.filter((_, i) => loads[i] === minLoad);

  return leastBusy[Math.floor(Math.random() * leastBusy.length)];
};
