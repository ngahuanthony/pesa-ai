#!/usr/bin/env node
const db = require("../pesa-src/db");
const whatsapp = require("../pesa-src/whatsapp");

function arg(name) {
  const prefix = "--" + name + "=";
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

function formatReport(data) {
  const low = data.lowStock.length ? data.lowStock.map((item) => item.name + " (" + item.stock + ")").join(", ") : "hakuna";
  const deni = data.deni.length ? data.deni.map((item) => (item.customerName || item.customerPhone) + " " + Number(item.amount).toLocaleString("en-KE") + " KSh").join(", ") : "hakuna";
  return "Habari " + data.businessName + " 👋\n\n" + "Leo: Sales " + data.salesCount + ", Total " + Number(data.totalSales).toLocaleString("en-KE") + " KSh\n" + "M-Pesa: " + Number(data.mpesaTotal).toLocaleString("en-KE") + " KSh (" + data.mpesaCount + " trans)\n" + "Deni leo: " + Number(data.deniTotal).toLocaleString("en-KE") + " KSh (" + deni + ")\n" + "Stock low: " + low;
}

async function main() {
  const businessId = arg("businessId");
  const businesses = businessId ? [db.getBusiness(businessId)] : db.listBusinesses();
  for (const business of businesses) {
    const settings = db.getDailyReportSettings(business.id);
    if (!settings.enabled || !settings.optIn || !business.personalPhone || !business.whatsappPhoneNumberId || business.whatsappConnectionStatus !== "live") continue;
    const data = db.getDailyReportData(business.id, arg("date"));
    const token = whatsapp.resolveAccessToken(business);
    if (!token) continue;
    await whatsapp.sendMessage(business.whatsappPhoneNumberId, business.personalPhone, formatReport(data), token);
    console.log("Daily report sent for " + business.id);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
