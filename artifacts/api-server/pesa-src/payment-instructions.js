function buildPublicPaymentInstructions(business, customerPhone) {
  const lines = [];
  const config = business?.mpesa;
  if (config?.shortcode) {
    if (config.method === "till") {
      lines.push(`M-Pesa: Lipa na M-Pesa → Buy Goods and Services → Till ${config.shortcode}`);
    } else if (config.method === "paybill" || config.method === "paybill_account") {
      lines.push(`M-Pesa: Lipa na M-Pesa → Paybill → Business number ${config.shortcode}`);
      if (config.method === "paybill_account") {
        const account = config.accountMode === "dynamic_customer_phone"
          ? String(customerPhone || "").replace(/\D/g, "")
          : String(config.accountNumber || "").trim();
        if (account) lines.push(`Account number: ${account}`);
      }
    }
  } else if (business?.paymentMethod === "mpesa" && business.paybillNumber) {
    if (business.mpesaType === "till") {
      lines.push(`M-Pesa: Lipa na M-Pesa → Buy Goods and Services → Till ${business.paybillNumber}`);
    } else {
      lines.push(`M-Pesa: Lipa na M-Pesa → Paybill → Business number ${business.paybillNumber}`);
      if (business.paybillAccountNumber) lines.push(`Account number: ${business.paybillAccountNumber}`);
    }
  }
  if (business?.paymentMethod === "bank" && business.bankName && business.bankAccountNumber) {
    lines.push(`Bank transfer: ${business.bankName}, account ${business.bankAccountNumber}`);
  }
  return lines.length ? `\n\nPayment details:\n${lines.join("\n")}` : "";
}

module.exports = { buildPublicPaymentInstructions };
