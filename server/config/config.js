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
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
};