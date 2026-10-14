'use strict';

/**
 * Help & support: tickets, the messages in them, and the admins' saved replies.
 * A few saved replies are added for the questions the pilot hears most.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { UUID, UUIDV4, STRING, TEXT, BOOLEAN, DATE, INTEGER, JSONB } = Sequelize;
    const now = new Date();

    await queryInterface.createTable('SupportTickets', {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      number: { type: STRING, allowNull: false, unique: true },
      userId: { type: UUID, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      guestName: { type: STRING, allowNull: true },
      guestEmail: { type: STRING, allowNull: true },
      guestTokenHash: { type: STRING, allowNull: true, unique: true },
      category: { type: STRING, allowNull: false },
      subject: { type: STRING, allowNull: false },
      status: { type: STRING, allowNull: false, defaultValue: 'open' },
      priority: { type: STRING, allowNull: false, defaultValue: 'normal' },
      relatedType: { type: STRING, allowNull: true },
      relatedId: { type: UUID, allowNull: true },
      context: { type: JSONB, allowNull: true },
      assigneeId: { type: UUID, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      userUnread: { type: BOOLEAN, allowNull: false, defaultValue: false },
      adminUnread: { type: BOOLEAN, allowNull: false, defaultValue: true },
      lastMessageAt: { type: DATE, allowNull: false },
      firstResponseAt: { type: DATE, allowNull: true },
      resolvedAt: { type: DATE, allowNull: true },
      closedAt: { type: DATE, allowNull: true },
      helpful: { type: BOOLEAN, allowNull: true },
      ratingComment: { type: TEXT, allowNull: true },
      escalatedTo: { type: STRING, allowNull: true },
      escalatedId: { type: UUID, allowNull: true },
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });
    await queryInterface.addIndex('SupportTickets', ['userId', 'status']);
    await queryInterface.addIndex('SupportTickets', ['status', 'lastMessageAt']);

    await queryInterface.createTable('SupportMessages', {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      ticketId: { type: UUID, allowNull: false, references: { model: 'SupportTickets', key: 'id' }, onDelete: 'CASCADE' },
      authorId: { type: UUID, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      authorRole: { type: STRING, allowNull: false },
      body: { type: TEXT, allowNull: false, defaultValue: '' },
      internal: { type: BOOLEAN, allowNull: false, defaultValue: false },
      systemKey: { type: STRING, allowNull: true },
      meta: { type: JSONB, allowNull: true },
      attachmentUrl: { type: STRING, allowNull: true },
      attachmentMime: { type: STRING, allowNull: true },
      attachmentName: { type: STRING, allowNull: true },
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });
    await queryInterface.addIndex('SupportMessages', ['ticketId', 'createdAt']);

    await queryInterface.createTable('SupportSavedReplies', {
      id: { type: UUID, defaultValue: UUIDV4, primaryKey: true },
      title: { type: STRING, allowNull: false },
      body: { type: TEXT, allowNull: false },
      bodyRw: { type: TEXT, allowNull: true },
      category: { type: STRING, allowNull: true },
      usageCount: { type: INTEGER, allowNull: false, defaultValue: 0 },
      createdBy: { type: UUID, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });

    const reply = (title, category, body, bodyRw) => ({
      id: require('crypto').randomUUID(), title, category, body, bodyRw, usageCount: 0, createdAt: now, updatedAt: now,
    });
    await queryInterface.bulkInsert('SupportSavedReplies', [
      reply(
        'MoMo prompt did not arrive',
        'payment',
        'Hello {{name}}, sorry about that. If the Mobile Money prompt did not appear on your phone, dial *182*7*1# to see payments waiting for your approval, and approve it there with your PIN. If it is not listed, open the job and press Pay again; the earlier request will not be charged twice.',
        "Muraho {{name}}, twihanganire. Niba ubutumwa bwo kwemeza kwishyura butagaragaye kuri telefoni yawe, kanda *182*7*1# urebe ubwishyu butegereje kwemezwa, maze ubwemeze ukoresheje PIN yawe. Niba butarimo, fungura akazi wongere ukande Ishyura; ubwa mbere ntibuzakatwa kabiri.",
      ),
      reply(
        'Payment still pending',
        'payment',
        'Hello {{name}}, MTN sometimes takes a few minutes to confirm a payment. We check it automatically every minute, and the job will show Paid as soon as MTN confirms. If it still shows pending after an hour, reply here with the time you approved it and we will chase it with MTN.',
        "Muraho {{name}}, rimwe na rimwe MTN itinda iminota mike kwemeza ubwishyu. Turabigenzura buri munota, kandi akazi kazerekana ko kishyuwe MTN ikimara kubyemeza. Niba nyuma y'isaha bikigaragara ko bitegereje, dusubize hano utubwire igihe wabyemereje, tubikurikirane na MTN.",
      ),
      reply(
        'How skill review works',
        'skills',
        'Hello {{name}}, two experienced workers in your trade review each submission, usually within two days. You will get a notification with their decision. If it is turned down, the notification says why, and you can appeal or submit new evidence from Settings › Proof of skill.',
        "Muraho {{name}}, abakozi babiri bafite uburambe mu mwuga wawe basuzuma buri cyo wohereje, akenshi mu minsi ibiri. Uzabona ubutumwa bukubwira icyemezo cyabo. Nibyangwa, ubutumwa buzakubwira impamvu, kandi ushobora kujurira cyangwa kohereza ibindi bimenyetso uhereye kuri Igenamiterere › Ibimenyetso by'ubuhanga.",
      ),
      reply(
        'Reset your password',
        'account',
        'Hello {{name}}, on the sign-in page choose "Forgot password?" and enter the email on your account. We will send a link that works for one hour. If the email does not arrive, check your spam folder, then reply here and we will help.',
        "Muraho {{name}}, ku rupapuro rwo kwinjira hitamo \"Wibagiwe ijambo ry'ibanga?\" maze wandike imeyili iri kuri konti yawe. Tuzakoherereza umurongo ukora mu isaha imwe. Niba imeyili itaje, reba mu bubiko bwa spam, hanyuma udusubize hano tugufashe.",
      ),
      reply(
        'Disagreement on a job',
        'job',
        'Hello {{name}}, thank you for telling us. If you and the other person cannot agree, we can open a dispute on the job: three independent mediators look at what both of you say and decide what is fair. Reply "yes" and we will open it for you.',
        "Muraho {{name}}, urakoze kutubwira. Niba wowe n'undi muntu mudashobora kumvikana, dushobora gufungura impaka kuri ako kazi: abahuza batatu bigenga bareba ibyo mwembi muvuga bagafata icyemezo gikwiye. Dusubize \"yego\" tuzayigufungurira.",
      ),
      reply(
        'Closing: solved',
        null,
        'Glad that is sorted, {{name}}. I will mark this as resolved; if anything else comes up, reply here and it will open again.',
        "Twishimiye ko byakemutse, {{name}}. Ngiye kubishyira nk'ibyakemutse; nihagira ikindi kibaho, dusubize hano bizongera bifunguke.",
      ),
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SupportSavedReplies');
    await queryInterface.dropTable('SupportMessages');
    await queryInterface.dropTable('SupportTickets');
  },
};
