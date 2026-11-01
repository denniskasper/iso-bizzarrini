ALTER TABLE "monthly_spending" DROP CONSTRAINT "monthly_spending_purpose_is_known";--> statement-breakpoint
ALTER TABLE "monthly_spending" ADD CONSTRAINT "monthly_spending_purpose_is_known" CHECK ("monthly_spending"."purpose" in ('proposal-conversations', 'catalog-runs'));--> statement-breakpoint
INSERT INTO "monthly_spending" ("month", "purpose", "billed", "estimated_cost_micro_usd")
SELECT to_char(coalesce("started_at", "created_at") AT TIME ZONE 'UTC', 'YYYY-MM'), 'catalog-runs', "charged", sum(round("spent" * 1000000))::bigint
FROM "catalog_runs" WHERE "spent" > 0
GROUP BY 1, 3;
