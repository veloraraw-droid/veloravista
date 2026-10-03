export const INTERAC_EMAIL = "velora-vista-visuals-ltd@vennpay.ca";

export const PAYMENT_METHODS: Record<string, string> = { stripe: "Card / Stripe", cash: "Cash", interac_etransfer: "Company Interac e-Transfer", personal_etransfer: "Personal e-Transfer", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };

export function invoiceStatusLabel(status?: string, method?: string) {
  if (status === "etransfer_pending") return "e-Transfer pending confirmation";
  if (status === "paid" && method) return `Paid — ${PAYMENT_METHODS[method] || method}`;
  return status || "Draft";
}
