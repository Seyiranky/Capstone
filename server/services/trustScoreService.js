const { Review, User } = require('../models');

exports.recalculate = async (userId) => {
  const reviews = await Review.findAll({ where: { recipientId: userId }, attributes: ['rating'] });
  const trustScore = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  await User.update({ trustScore }, { where: { id: userId } });
  return trustScore;
};
