require('dotenv').config({ quiet: true });

module.exports = {
  development: {
    username: process.env.DB_USER || 'isoko',
    password: process.env.DB_PASSWORD || 'isoko',
    database: process.env.DB_NAME || 'isoko_talents_dev',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
  },
  test: {
    username: process.env.DB_USER || 'isoko',
    password: process.env.DB_PASSWORD || 'isoko',
    database: process.env.DB_NAME_TEST || 'isoko_talents_test',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    // A free hosted database allows few connections; one API instance needs few.
    pool: { max: 5, min: 0, idle: 10000, acquire: 30000 },
    // SSL is required by every managed Postgres; DATABASE_SSL=false is only for
    // trying the production image against a local database.
    dialectOptions:
      process.env.DATABASE_SSL === 'false'
        ? {}
        : {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          },
  },
};