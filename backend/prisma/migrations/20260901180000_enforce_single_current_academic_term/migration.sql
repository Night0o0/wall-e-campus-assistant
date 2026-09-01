-- The API switches the current term transactionally, but concurrent requests
-- still need a database invariant. PostgreSQL's partial unique index expresses
-- exactly one TRUE row per university while allowing any number of historical
-- (FALSE) rows.
CREATE UNIQUE INDEX "AcademicTerm_one_current_per_organization_key"
ON "public"."AcademicTerm"("organizationId")
WHERE "isCurrent" = true;
