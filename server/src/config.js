// Configuración del servicio. Todo viene de variables de entorno (ver
// .env.example); nada de credenciales vive en el código.

function toInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function toPort(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT debe ser un número entero entre 1 y 65535.");
  }
  return port;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "si", "sí"].includes(String(value).toLowerCase());
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const dryRun = toBool(env.MAIL_DRY_RUN);

  const config = {
    production,
    host: env.HOST || "0.0.0.0",
    port: toPort(env.PORT, 3001),
    apiKey: env.NOTIFY_API_KEY || "",
    databaseUrl: env.DATABASE_URL || "",
    sessionSecret: env.SESSION_SECRET || "",
    adminEmail: env.ADMIN_EMAIL || "",
    adminPassword: env.ADMIN_PASSWORD || "",
    whatsapp: {
      accessToken: env.WHATSAPP_ACCESS_TOKEN || "",
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
      apiVersion: env.WHATSAPP_API_VERSION || "v22.0",
      otpTemplate: env.WHATSAPP_OTP_TEMPLATE || "customer_login_otp",
      orderTemplate: env.WHATSAPP_ORDER_TEMPLATE || "repair_order_code",
      templateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE || "es",
    },
    trustProxy: toBool(env.TRUST_PROXY),
    allowedOrigins: (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    limits: {
      perIpPerHour: toInt(env.RATE_LIMIT_IP_PER_HOUR, 30),
      perEmailPerHour: toInt(env.RATE_LIMIT_EMAIL_PER_HOUR, 5),
      bodyBytes: 3_500_000,
    },
    mail: {
      dryRun,
      from: env.MAIL_FROM || "",
      host: env.SMTP_HOST || "",
      port: toInt(env.SMTP_PORT, 587),
      // true = TLS directo (puerto 465). false = STARTTLS (puerto 587).
      secure: toBool(env.SMTP_SECURE),
      user: env.SMTP_USER || "",
      pass: env.SMTP_PASS || "",
    },
    business: {
      name: env.BUSINESS_NAME || "Taller Digital",
      phone: env.BUSINESS_PHONE || "",
      email: env.BUSINESS_EMAIL || "",
      address: env.BUSINESS_ADDRESS || "",
      hours: env.BUSINESS_HOURS || "",
      responseTime: env.BUSINESS_RESPONSE_TIME || "",
    },
  };

  const problems = [];
  if (production && config.apiKey.length < 16) {
    problems.push("NOTIFY_API_KEY es obligatoria en producción (mínimo 16 caracteres).");
  }
  if (!dryRun) {
    if (!config.mail.from) problems.push("MAIL_FROM es obligatorio.");
    if (!config.mail.host) problems.push("SMTP_HOST es obligatorio.");
  }
  if (Boolean(config.whatsapp.accessToken) !== Boolean(config.whatsapp.phoneNumberId)) {
    problems.push("WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID deben configurarse juntos.");
  }
  if (problems.length > 0) {
    throw new Error(`Configuración inválida:\n- ${problems.join("\n- ")}`);
  }
  return config;
}
