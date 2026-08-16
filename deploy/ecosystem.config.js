// PM2 process manager config — keeps the API server alive and restarts on crash.
// Usage: pm2 start deploy/ecosystem.config.js
//        pm2 save   (persist across reboots)

module.exports = {
  apps: [
    {
      name: "pesa-api",
      script: "artifacts/api-server/server.js",
      cwd: "/opt/pesa-ai",
      env_file: "/opt/pesa-ai/.env",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      error_file: "/var/log/pesa-ai/error.log",
      out_file: "/var/log/pesa-ai/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
