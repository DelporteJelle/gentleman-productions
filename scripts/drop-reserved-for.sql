-- Step 2 of 2 for retiring seats.reserved_for.
--
-- RUN THIS ONLY AFTER the application code that no longer reads the column has
-- been deployed. Running it earlier makes the live checkout claim's
-- `AND s.reserved_for IS NULL` raise `column does not exist`, which 500s every
-- purchase until the deploy lands.
--
-- Order: (1) run ticketing-schema.sql  (2) deploy  (3) run this.
alter table seats drop column if exists reserved_for;
