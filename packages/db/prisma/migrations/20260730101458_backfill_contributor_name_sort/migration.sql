-- Backfill Contributor.nameSort so authors file under their surname.
--
-- nameSort was null for the overwhelming majority of contributors, because it
-- is only written in the create branch of the ingest upsert and nothing ever
-- revisited existing rows. Author sort falls back to nameCanonical when
-- nameSort is null, and nameCanonical is first-name-first, so the library
-- sorted authors by given name.
--
-- This runs as a migration rather than an operator script because the web
-- entrypoint applies migrations on startup: every deployment of this image
-- gets the fix without anyone being asked to run anything by hand.
--
-- The rules mirror generateNameSort in packages/ingest/src/sort-keys.ts and
-- were verified to agree with it on every contributor name in a real library.
-- Future rows get their key from that function at ingest; this only repairs
-- history, so the two cannot drift apart afterwards.

CREATE OR REPLACE FUNCTION pg_temp.bh_invert_single_name(name TEXT) RETURNS TEXT AS $$
DECLARE
  parts    TEXT[];
  suffixes TEXT[] := '{}';
  surname  TEXT;
BEGIN
  parts := regexp_split_to_array(btrim(name), '\s+');
  parts := ARRAY(SELECT p FROM unnest(parts) AS p WHERE p <> '');

  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) <= 1 THEN
    RETURN lower(btrim(name));
  END IF;

  -- "Martin Luther King Jr." files under King, suffix trailing the given names.
  WHILE array_length(parts, 1) > 1
    AND parts[array_length(parts, 1)] ~* '^(jr|sr|ii|iii|iv|v)\.?$'
  LOOP
    suffixes := array_prepend(parts[array_length(parts, 1)], suffixes);
    parts    := parts[1:array_length(parts, 1) - 1];
  END LOOP;

  IF array_length(parts, 1) <= 1 THEN
    RETURN lower(array_to_string(parts || suffixes, ' '));
  END IF;

  surname := parts[array_length(parts, 1)];
  parts   := parts[1:array_length(parts, 1) - 1];

  RETURN lower(surname || ', ' || array_to_string(parts || suffixes, ' '));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.bh_name_sort(name_display TEXT) RETURNS TEXT AS $$
DECLARE
  trimmed  TEXT;
  segments TEXT[];
BEGIN
  trimmed := btrim(name_display);
  IF trimmed = '' THEN
    RETURN '';
  END IF;

  segments := ARRAY(
    SELECT btrim(s) FROM unnest(string_to_array(trimmed, ',')) AS s WHERE btrim(s) <> ''
  );

  -- "John Gottman, PhD" is one person, not a surname followed by given names.
  WHILE array_length(segments, 1) > 1
    AND segments[array_length(segments, 1)] ~* '^(phd|md|ma|mba|msc|dma|dds|edd|jd|esq|rn|dvm|lcsw)\.?$'
  LOOP
    segments := segments[1:array_length(segments, 1) - 1];
  END LOOP;

  IF array_length(segments, 1) IS NULL THEN
    RETURN lower(trimmed);
  END IF;

  -- Three or more segments is a list of people: file under the first, rather
  -- than under the surname of whoever happens to be listed last.
  IF array_length(segments, 1) >= 3 THEN
    RETURN pg_temp.bh_invert_single_name(segments[1]);
  END IF;

  -- Exactly two segments is the cataloguing convention "Last, First" — already
  -- in sort order, so normalize it rather than inverting a second time.
  IF array_length(segments, 1) = 2 THEN
    RETURN lower(segments[1] || ', ' || regexp_replace(segments[2], '\s+', ' ', 'g'));
  END IF;

  RETURN pg_temp.bh_invert_single_name(segments[1]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Only touch rows whose key actually changes, so re-running is a no-op.
UPDATE "Contributor"
SET "nameSort" = pg_temp.bh_name_sort("nameDisplay")
WHERE "nameSort" IS DISTINCT FROM pg_temp.bh_name_sort("nameDisplay");
