-- Extensions required by the schema (citext columns) and by the exclusion constraints
-- in the constraints migration (btree_gist). Kept separate so it runs before the tables.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
