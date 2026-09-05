import { requireAppUser } from "../../lib/auth";
import { ClientWorkspace } from "../client-workspace";
export const dynamic="force-dynamic";
export default async function Portal(){await requireAppUser("/client-portal",["client"]);return <ClientWorkspace/>}
