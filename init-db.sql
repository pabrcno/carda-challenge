-- Database initialization script
-- This script runs when the PostgreSQL container starts for the first time

-- Create the database (already created by POSTGRES_DB env var)
-- But we can add initial setup here if needed

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set timezone
SET timezone = 'UTC';

-- You can add initial data or additional setup here
-- For example:
-- INSERT INTO users (name, email) VALUES ('Admin', 'admin@example.com');

-- Log that initialization is complete
SELECT 'Database initialization complete' AS status;
