-- PostgreSQL init script for concurrent test databases
-- Executed on first container startup via /docker-entrypoint-initdb.d/
-- Creates all test suite databases with IF NOT EXISTS for idempotency

-- Create test databases for concurrent test suites
CREATE DATABASE IF NOT EXISTS llamenos_desktop;
CREATE DATABASE IF NOT EXISTS llamenos_bdd;
CREATE DATABASE IF NOT EXISTS llamenos_ios;
CREATE DATABASE IF NOT EXISTS llamenos_android_0;
CREATE DATABASE IF NOT EXISTS llamenos_android_1;
CREATE DATABASE IF NOT EXISTS llamenos_android_2;

-- Grant ALL PRIVILEGES on each database to user llamenos
GRANT ALL PRIVILEGES ON DATABASE llamenos_desktop TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_bdd TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_ios TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_android_0 TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_android_1 TO llamenos;
GRANT ALL PRIVILEGES ON DATABASE llamenos_android_2 TO llamenos;
