const config = require('../../config').sap;

/**
 * SAP integration seam.
 * The SAP engineer should implement the methods below after confirming the SAP product,
 * API type, company/database and authentication method. Do not put SAP credentials in the app.
 */
class SapAdapter {
  status() {
    const configured = Boolean(config.baseUrl && config.mode !== 'disabled');
    return {
      configured,
      mode: config.mode,
      baseUrlConfigured: Boolean(config.baseUrl),
      companyConfigured: Boolean(config.companyDb),
      authType: config.authType,
      message: configured
        ? 'SAP endpoint is configured; connector implementation must be validated for the company SAP system.'
        : 'SAP is not configured. Fill server-side environment variables after the SAP engineer confirms the API.'
    };
  }

  async createSalesOrder(_orderPayload) {
    throw new Error('SAP connector is a placeholder. Implement createSalesOrder() for the company SAP API.');
  }

  async fetchCustomers() {
    throw new Error('SAP connector is a placeholder. Implement fetchCustomers() for the company SAP API.');
  }

  async fetchProducts() {
    throw new Error('SAP connector is a placeholder. Implement fetchProducts() for the company SAP API.');
  }

  async fetchInvoices() {
    throw new Error('SAP connector is a placeholder. Implement fetchInvoices() for the company SAP API.');
  }
}

module.exports = new SapAdapter();
