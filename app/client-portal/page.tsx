import { requireAppUser } from "../../lib/auth";
import { ClientWorkspace } from "../client-workspace";
export const dynamic="force-dynamic";
export default async function Portal({searchParams}:{searchParams:Promise<{tab?:string;invoice?:string;payment?:string;session_id?:string}>}){
  const query=await searchParams;
  const destination=`/client-portal?${new URLSearchParams(Object.entries(query).filter((entry):entry is [string,string]=>Boolean(entry[1]))).toString()}`;
  await requireAppUser(destination,["client"]);
  return <ClientWorkspace initialTab={query.tab} initialInvoiceId={query.invoice} paymentResult={query.payment} sessionId={query.session_id}/>;
}
