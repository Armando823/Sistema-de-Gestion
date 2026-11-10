export function createWhatsApp(config, fetchImpl = fetch) {
  const { accessToken, phoneNumberId, apiVersion } = config.whatsapp;

  async function sendTemplate(phone, templateName, language, components) {
    if (!accessToken || !phoneNumberId) {
      throw new Error("El envío por WhatsApp no está configurado en el servidor.");
    }
    const response = await fetchImpl(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone.replace("+", ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new Error("Meta no pudo entregar el mensaje de WhatsApp. Revisa las plantillas y el número configurados.");
    }
  }

  return {
    sendLoginCode(phone, code) {
      return sendTemplate(phone, config.whatsapp.otpTemplate, config.whatsapp.templateLanguage, [
        {
          type: "body",
          parameters: [{ type: "text", text: code }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        },
      ]);
    },
    sendRepairCode(phone, repairId) {
      return sendTemplate(phone, config.whatsapp.orderTemplate, config.whatsapp.templateLanguage, [{
        type: "body",
        parameters: [{ type: "text", text: repairId }],
      }]);
    },
  };
}
