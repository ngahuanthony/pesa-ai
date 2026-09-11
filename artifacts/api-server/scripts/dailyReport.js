#!/usr/bin/env node
const runner = require("../cron/dailyReport");
function arg(name) { const prefix = "--" + name + "="; const item = process.argv.slice(2).find((value) => value.startsWith(prefix)); return item ? item.slice(prefix.length) : null; }
if (require.main === module) runner.runDailyReports({ businessId: arg("businessId"), date: arg("date"), force: arg("force") === "true" }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = runner;
