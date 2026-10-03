export const INTERAC_EMAIL = "velora-vista-visuals-ltd@vennpay.ca";

export function invoiceStatusLabel(status?: string, method?: string) {
  if (status === "etransfer_pending") return "e-Transfer pending confirmation";
  if (status === "paid" && method === "interac_etransfer") return "Paid — Interac e-Transfer";
  return status || "Draft";
}
