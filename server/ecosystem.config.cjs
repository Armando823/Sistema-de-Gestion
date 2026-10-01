// PM2: pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "taller-notificaciones",
      script: "src/index.js",
      node_args: "--env-file=.env",
      env: { NODE_ENV: "production" },
      max_memory_restart: "200M",
      autorestart: true,
    },
  ],
};
