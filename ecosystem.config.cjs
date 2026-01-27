// PM2 Ecosystem Configuration
// https://pm2.keymetrics.io/docs/usage/application-declaration/
//
// Start all services:   pm2 start ecosystem.config.cjs
// Stop all services:    pm2 stop ecosystem.config.cjs
// Restart all:          pm2 restart ecosystem.config.cjs
// View logs:            pm2 logs
// Monitor:              pm2 monit

module.exports = {
  apps: [
    {
      name: 'api',
      cwd: './apps/api',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Logging
      error_file: '/var/log/discord-server-manager/api-error.log',
      out_file: '/var/log/discord-server-manager/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'discord-bot',
      cwd: './apps/discord-bot',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      // Logging
      error_file: '/var/log/discord-server-manager/bot-error.log',
      out_file: '/var/log/discord-server-manager/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
