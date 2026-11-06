import { auth } from "@clerk/nextjs/server";
import BootstrapClient from "./BootstrapClient";

export default async function BootstrapPage() {
  await auth.protect();

  return <BootstrapClient />;
}
