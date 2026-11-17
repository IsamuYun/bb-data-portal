ALTER TABLE "records" ADD COLUMN "delisted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "availability" text GENERATED ALWAYS AS (case
  when delisted_at is not null then 'delisted'
  when data->>'vialStock' = 'in_stock' then 'available'
  when data->>'vialStock' = 'sold_out' then 'sold_out'
  when data->>'vialStock' = 'unknown' then 'unknown'
  when coalesce(data->>'availableVials', '') ~ '[1-9]' then 'available'
  when btrim(coalesce(data->>'availableVials', '')) = '0' then 'sold_out'
  else 'unknown'
end) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "records_availability_idx" ON "records" USING btree ("availability");