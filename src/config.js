require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://salesapp:salesapp_dev_password@localhost:5432/salesforce',
  jwtSecret: process.env.JWT_SECRET || 'local_dev_only_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  sap: {
    mode: process.env.SAP_MODE || 'disabled',
    baseUrl: process.env.SAP_BASE_URL || '',
    companyDb: process.env.SAP_COMPANY_DB || '',
    username: process.env.SAP_USERNAME || '',
    password: process.env.SAP_PASSWORD || '',
    authType: process.env.SAP_AUTH_TYPE || 'service-layer',
    timeoutMs: Number(process.env.SAP_TIMEOUT_MS || 15000)
  }
};
