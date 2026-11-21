CREATE OR REPLACE FUNCTION relay_member_keep_owner() RETURNS trigger AS $$
BEGIN
  -- Only a change that takes away an active owner can break the rule.
  IF OLD.status <> 'active' OR NOT ('owner' = ANY (string_to_array(replace(OLD.role, ' ', ''), ','))) THEN
    RETURN NULL;
  END IF;
  -- Serialise changes per workspace; a cascaded workspace delete finds no row and is allowed.
  PERFORM 1 FROM organization WHERE id = OLD.organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM member m
    WHERE m.organization_id = OLD.organization_id
      AND m.status = 'active'
      AND 'owner' = ANY (string_to_array(replace(m.role, ' ', ''), ','))
  ) THEN
    RAISE EXCEPTION 'A workspace needs at least one owner' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS member_keep_owner ON member;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER member_keep_owner
  AFTER UPDATE OR DELETE ON member
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION relay_member_keep_owner();
