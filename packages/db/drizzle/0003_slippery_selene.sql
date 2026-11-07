CREATE TABLE "dictionary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lang" text DEFAULT 'zh' NOT NULL,
	"field_key" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"target" text,
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_translations" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_entries_uq" ON "dictionary_entries" USING btree ("lang","field_key","source");