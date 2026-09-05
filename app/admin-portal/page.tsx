import {requireAppUser} from "../../lib/auth";import {AdminPortal} from "../admin-components";
export const dynamic="force-dynamic";
export default async function AdminPortalPage(){const user=await requireAppUser("/admin-portal",["owner","admin","team"]);return <AdminPortal user={user}/>}
