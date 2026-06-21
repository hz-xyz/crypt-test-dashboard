import { Console } from "@/components/console/console";
import { getEnv } from "@/lib/env";

/**
 * /console — operator console for firing test payments at the gateway and
 * watching the full create → callback → settle flow (R5).
 *
 * Server component: reads DEFAULT_PAYOUT_ADDRESS server-side and passes it to
 * the client form as a prop (the value never goes through a client env read).
 */
export const dynamic = "force-dynamic";

export default function ConsolePage() {
  let defaultPayoutAddress: string | undefined;
  try {
    defaultPayoutAddress = getEnv().DEFAULT_PAYOUT_ADDRESS;
  } catch {
    // Misconfigured env surfaces when the create request runs; the form still
    // renders so the operator sees the page rather than a crash.
    defaultPayoutAddress = undefined;
  }

  return <Console defaultPayoutAddress={defaultPayoutAddress} />;
}
