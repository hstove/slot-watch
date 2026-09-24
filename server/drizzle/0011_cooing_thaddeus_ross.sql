CREATE TABLE "hourly_prices" (
	"source" varchar(32) NOT NULL,
	"product_id" varchar(20) NOT NULL,
	"hour_start" timestamp with time zone NOT NULL,
	"open_price" numeric(24, 10) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hourly_prices_source_product_hour_pk" PRIMARY KEY("source","product_id","hour_start"),
	CONSTRAINT "hourly_prices_open_positive" CHECK ("hourly_prices"."open_price" > 0),
	CONSTRAINT "hourly_prices_hour_aligned" CHECK (extract(epoch from "hourly_prices"."hour_start") % 3600 = 0)
);
