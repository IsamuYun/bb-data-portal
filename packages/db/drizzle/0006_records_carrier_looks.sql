ALTER TABLE "records" ADD COLUMN "carrier_status" text GENERATED ALWAYS AS (case
  when manual ? 'carriers' then
    case when manual->'carriers'->>'kind' = 'none' or coalesce(jsonb_array_length(case when jsonb_typeof(manual->'carriers'->'items') = 'array' then manual->'carriers'->'items' end), 0) = 0 then 'none' else 'carrier' end
  when jsonb_typeof(data->'gtsCarriers') = 'array' then
    case when jsonb_array_length(data->'gtsCarriers') = 0 then 'none' else 'carrier' end
  when coalesce(data->>'gtsPanel', '') <> '' or (jsonb_typeof(data->'geneticTests') = 'array' and jsonb_array_length(data->'geneticTests') > 0) then 'pending'
  else 'untested'
end) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "looks" smallint;--> statement-breakpoint
CREATE INDEX "records_carrier_status_idx" ON "records" USING btree ("carrier_status");--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_looks_range" CHECK ("records"."looks" between 1 and 10);