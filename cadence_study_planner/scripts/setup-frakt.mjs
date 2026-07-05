/**
 * One-time provisioning script for the Cadence -> Frakt integration.
 *
 * Cadence is an ordinary Frakt customer: it registers a tenant and uploads
 * its chart template through Frakt's public HTTP API, exactly like any other
 * consumer would. Frakt itself knows nothing about Cadence — the template is
 * stored in Frakt's database and referenced by name afterwards.
 *
 * Usage (from cadence_study_planner/, with the Frakt gateway reachable):
 *     node scripts/setup-frakt.mjs
 *
 * Environment overrides:
 *     FRAKT_BASE_URL          Base URL of the running Frakt gateway
 *                             (default: http://127.0.0.1:8000)
 *     CADENCE_CUSTOMER_NAME   Display name for the Frakt tenant
 *                             (default: "Cadence Study Planner")
 *     CADENCE_CUSTOMER_EMAIL  Email used to register the tenant
 *                             (default: "cadence-platform@cadence-study-planner.app")
 *
 * Notes:
 *     - Frakt's Worker is NOT required for this script — registration only
 *       touches the Gateway + database. It must be running before Cadence
 *       generates real charts.
 *     - Frakt issues the raw API key ONCE, on registration, and never again.
 *       If a customer with this email already exists, this script fails with
 *       409. Either set CADENCE_CUSTOMER_EMAIL to a fresh address, or
 *       authenticate as the existing customer and call
 *       POST /v1/customers/rotate-key to mint a new key for that account.
 *     - New accounts start on the "free" tier (100 request quota).
 *       /v1/generate-predictive deducts 2 credits per call — upgrade the
 *       tier directly in Frakt's database for real usage.
 */

import {
  TEMPLATE_NAME,
  TEMPLATE_CODE,
  REQUIRED_PARAMS,
} from "./frakt-template.mjs";

const FRAKT_BASE_URL = (
  process.env.FRAKT_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
const CUSTOMER_NAME = process.env.CADENCE_CUSTOMER_NAME || "Cadence Study Planner";
const CUSTOMER_EMAIL =
  process.env.CADENCE_CUSTOMER_EMAIL || "cadence-platform@cadence-study-planner.app";

async function main() {
  console.log(`Frakt gateway: ${FRAKT_BASE_URL}`);
  console.log(`Registering customer '${CUSTOMER_NAME}' <${CUSTOMER_EMAIL}>...`);

  let registerRes;
  try {
    registerRes = await fetch(`${FRAKT_BASE_URL}/v1/customers/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: CUSTOMER_NAME, email: CUSTOMER_EMAIL }),
    });
  } catch (error) {
    console.error(
      `\nERROR: Could not reach the Frakt gateway at ${FRAKT_BASE_URL}.\n` +
        "Start it first, e.g. from frakt_analytic_service/: python main.py\n" +
        `(${error.cause?.code || error.message})`
    );
    return 1;
  }

  if (registerRes.status === 409) {
    console.error(
      "\nERROR: A customer with this email is already registered.\n" +
        "Frakt never re-issues a raw API key for an existing account.\n" +
        "Either:\n" +
        "  - set CADENCE_CUSTOMER_EMAIL to a new address and re-run, or\n" +
        "  - authenticate as the existing customer and call\n" +
        "    POST /v1/customers/rotate-key to mint a fresh key, then\n" +
        "    register the template manually with that key.\n"
    );
    return 1;
  }

  if (!registerRes.ok) {
    console.error(
      `\nERROR: Registration failed with ${registerRes.status}: ${await registerRes.text()}`
    );
    return 1;
  }

  const { api_key: apiKey, customer_id: customerId } = await registerRes.json();
  console.log(`Customer registered: ${customerId}`);

  console.log(`Registering chart template '${TEMPLATE_NAME}'...`);
  const templateRes = await fetch(`${FRAKT_BASE_URL}/v1/templates/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      template_name: TEMPLATE_NAME,
      template_code: TEMPLATE_CODE,
      required_params: REQUIRED_PARAMS,
    }),
  });

  if (!templateRes.ok) {
    console.error(
      `\nERROR: Template registration failed with ${templateRes.status}: ${await templateRes.text()}`
    );
    return 1;
  }

  console.log(`Template registered: ${JSON.stringify(await templateRes.json())}`);

  console.log("\n" + "=".repeat(70));
  console.log("Add the following to cadence_study_planner/.env.local:");
  console.log("=".repeat(70));
  console.log(`FRAKT_API_URL=${FRAKT_BASE_URL}`);
  console.log(`FRAKT_API_KEY=${apiKey}`);
  console.log(`FRAKT_CHART_TEMPLATE=${TEMPLATE_NAME}`);
  console.log("=".repeat(70));
  console.log(
    "\nStore this API key securely - Frakt will not display it again.\n" +
      "If lost, authenticate with it once and call POST /v1/customers/rotate-key\n" +
      "to issue a replacement."
  );
  return 0;
}

main().then((code) => process.exit(code));
