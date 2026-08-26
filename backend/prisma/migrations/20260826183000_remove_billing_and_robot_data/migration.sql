ALTER TABLE "public"."Organization"
  DROP CONSTRAINT IF EXISTS "Organization_subscriptionId_fkey";

DROP INDEX IF EXISTS "public"."Organization_subscriptionId_key";

ALTER TABLE "public"."Organization"
  DROP COLUMN IF EXISTS "subscriptionId";

DROP TABLE IF EXISTS "public"."Payment";
DROP TABLE IF EXISTS "public"."Invoice";
DROP TABLE IF EXISTS "public"."Subscription";
DROP TABLE IF EXISTS "public"."SubscriptionPlan";
DROP TABLE IF EXISTS "public"."_retired_RobotDevice";

DROP TYPE IF EXISTS "public"."SubscriptionStatus";
DROP TYPE IF EXISTS "public"."BillingCycle";
DROP TYPE IF EXISTS "public"."PaymentStatus";
DROP TYPE IF EXISTS "public"."InvoiceStatus";
DROP TYPE IF EXISTS "public"."DeviceStatus";
