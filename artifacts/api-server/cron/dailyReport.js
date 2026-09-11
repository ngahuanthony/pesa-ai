#!/usr/bin/env node
const db = require("../pesa-src/db");
const whatsapp = require("../pesa-src/whatsapp");

function arg(name) { const prefix = "--" + name + "="; const item = process.argv.slice(2).find((value) => value.startsWith(prefix)); return item ? item.slice(prefix.length) : null; }
function nairobiDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date()); }
function formatReport(data) {
  const low = data.lowStock.length ? data.lowStock.map((item) => item.name + " (" + item.stock + ")").join(", ") : "hakuna";
  const deni = data.deni.length ? data.deni.map((item) => (item.customerName || item.customerPhone) + " " + Number(item.amount).toLocaleString("en-KE") + " KSh").join(", ") : "hakuna";
  return "Habari " + data.businessName + " 👋\n\nLeo: Sales " + data.salesCount + ", Total " + Number(data.totalSales).toLocaleString("en-KE") + " KSh\nM-Pesa: " + Number(data.mpesaTotal).toLocaleString("en-KE") + " KSh (" + data.mpesaCount + " trans)\nDeni: " + Number(data.deniTotal).toLocaleString("en-KE") + " KSh (" + deni + ")\nStock low: " + low;
}
async function runDailyReports({ businessId = null, date = null, force = false } = {}) {
  const reportDate = date || nairobiDate();
  const businesses = businessId ? [db.getBusiness(businessId)] : db.listBusinesses();
  const results = [];
  for (const business of businesses) {
    const settings = db.getDailyReportSettings(business.id);
    if (!settings.enabled || !settings.optIn || !business.personalPhone || !business.whatsappPhoneNumberId || business.whatsappConnectionStatus !== "live") { results.push({ businessId: business.id, skipped: true }); continue; }
    if (!force && db.wasDailyReportSent(business.id, reportDate)) { results.push({ businessId: business.id, skipped: true, reason: "already-sent" }); continue; }
    const token = whatsapp.resolveAccessToken(business);
    if (!token) { results.push({ businessId: business.id, skipped: true, reason: "no-whatsapp-token" }); continue; }
    const data = db.getDailyReportData(business.id, reportDate);
    const delivered = await whatsapp.sendMessage(business.whatsappPhoneNumberId, business.personalPhone, formatReport(data), token);
    if (delivered === false) { results.push({ businessId: business.id, skipped: true, reason: "send-failed" }); continue; }
    db.markDailyReportSent(business.id, reportDate);
    results.push({ businessId: business.id, sent: true });
  }
  return results;
}

if (require.main === module) runDailyReports({ businessId: arg("businessId"), date: arg("date"), force: arg("force") === "true" }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { runDailyReports, formatReport };
