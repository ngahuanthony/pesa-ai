export function getMessagingBlockMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "owner_verification_required":
      return "Verified owner checks are incomplete, so customer replies are paused.";
    case "business_activation_incomplete":
      return "Business activation checks are incomplete, so customer replies are paused.";
    case "business_inactive":
      return "This business is not active, so customer replies are paused.";
    case "whatsapp_connection_inactive":
      return "The WhatsApp connection is not fully live yet.";
    default:
      return "Customer-message readiness could not be confirmed. Do not share the WhatsApp QR yet.";
  }
}