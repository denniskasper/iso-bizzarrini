-- The API test seam runs against a real Postgres. It gets its own database so a test run can
-- never touch whatever an Editor has been practising on in development.
CREATE DATABASE ricambi_test OWNER ricambi;
