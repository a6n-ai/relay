import { redirect } from "next/navigation";

export default function SendingRedirect() {
  redirect("/dashboard/settings/email");
}
