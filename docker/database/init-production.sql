-- ================================
-- PostgreSQL Production Database Initialization
-- ================================
-- Sets up production database with proper users, permissions, and security

-- Set timezone to UTC for consistency
SET timezone = 'UTC';

-- ================================
-- Database Creation
-- ================================
CREATE DATABASE sightedit_production
    WITH ENCODING 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE = template0;

-- ================================
-- User and Role Creation
-- ================================

-- Application user (read/write access)
CREATE USER sightedit_app WITH 
    PASSWORD 'CHANGE_THIS_PASSWORD_IN_PRODUCTION'
    NOSUPERUSER 
    NOCREATEDB 
    NOCREATEROLE 
    NOREPLICATION
    CONNECTION LIMIT 50;

-- Read-only user (for analytics, reporting)
CREATE USER sightedit_readonly WITH 
    PASSWORD 'CHANGE_THIS_READONLY_PASSWORD'
    NOSUPERUSER 
    NOCREATEDB 
    NOCREATEROLE 
    NOREPLICATION
    CONNECTION LIMIT 20;

-- Backup user (for pg_dump and WAL archiving)
CREATE USER sightedit_backup WITH 
    PASSWORD 'CHANGE_THIS_BACKUP_PASSWORD'
    NOSUPERUSER 
    NOCREATEDB 
    NOCREATEROLE 
    REPLICATION
    CONNECTION LIMIT 5;

-- Monitoring user (for metrics collection)
CREATE USER sightedit_monitor WITH 
    PASSWORD 'CHANGE_THIS_MONITOR_PASSWORD'
    NOSUPERUSER 
    NOCREATEDB 
    NOCREATEROLE 
    NOREPLICATION
    CONNECTION LIMIT 10;

-- Replication user (for read replicas)
CREATE USER sightedit_replica WITH 
    PASSWORD 'CHANGE_THIS_REPLICA_PASSWORD'
    NOSUPERUSER 
    NOCREATEDB 
    NOCREATEROLE 
    REPLICATION
    CONNECTION LIMIT 3;

-- ================================
-- Connect to production database
-- ================================
\c sightedit_production;

-- ================================
-- Extensions Installation
-- ================================
-- Required extensions for SightEdit functionality
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";        -- UUID generation
CREATE EXTENSION IF NOT EXISTS "citext";           -- Case-insensitive text
CREATE EXTENSION IF NOT EXISTS "hstore";           -- Key-value pairs
CREATE EXTENSION IF NOT EXISTS "pg_trgm";          -- Trigram matching for search
CREATE EXTENSION IF NOT EXISTS "btree_gin";        -- GIN indexes for better performance
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance monitoring

-- ================================
-- Schema Creation
-- ================================
-- Main application schema
CREATE SCHEMA IF NOT EXISTS app;

-- Audit schema for change tracking
CREATE SCHEMA IF NOT EXISTS audit;

-- Analytics schema for reporting
CREATE SCHEMA IF NOT EXISTS analytics;

-- ================================
-- Core Tables
-- ================================

-- Users table
CREATE TABLE app.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Sites table
CREATE TABLE app.sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT sites_domain_check CHECK (domain ~* '^[a-z0-9.-]+\.[a-z]{2,}$')
);

-- Content edits table
CREATE TABLE app.content_edits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES app.sites(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    element_selector TEXT NOT NULL,
    element_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT content_edits_element_type_check CHECK (
        element_type IN ('text', 'richtext', 'image', 'link', 'color', 'number', 'date', 'select', 'json', 'collection')
    )
);

-- Sessions table (for managing user sessions)
CREATE TABLE app.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- API keys table
CREATE TABLE app.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    permissions JSONB DEFAULT '[]',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- File uploads table
CREATE TABLE app.uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    site_id UUID REFERENCES app.sites(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- Audit Tables
-- ================================

-- Audit log for all table changes
CREATE TABLE audit.change_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    row_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_by UUID REFERENCES app.users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- ================================
-- Analytics Tables
-- ================================

-- Daily usage statistics
CREATE TABLE analytics.daily_stats (
    date DATE PRIMARY KEY,
    total_users BIGINT DEFAULT 0,
    active_users BIGINT DEFAULT 0,
    total_edits BIGINT DEFAULT 0,
    total_sites BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- Indexes for Performance
-- ================================

-- Users indexes
CREATE INDEX idx_users_email ON app.users(email);
CREATE INDEX idx_users_active ON app.users(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_users_created_at ON app.users(created_at);

-- Sites indexes
CREATE INDEX idx_sites_user_id ON app.sites(user_id);
CREATE INDEX idx_sites_domain ON app.sites(domain);
CREATE INDEX idx_sites_active ON app.sites(is_active) WHERE is_active = TRUE;

-- Content edits indexes
CREATE INDEX idx_content_edits_site_id ON app.content_edits(site_id);
CREATE INDEX idx_content_edits_user_id ON app.content_edits(user_id);
CREATE INDEX idx_content_edits_created_at ON app.content_edits(created_at);
CREATE INDEX idx_content_edits_element_type ON app.content_edits(element_type);
CREATE INDEX idx_content_edits_composite ON app.content_edits(site_id, created_at DESC);

-- Sessions indexes
CREATE INDEX idx_sessions_user_id ON app.sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON app.sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON app.sessions(expires_at);

-- API keys indexes
CREATE INDEX idx_api_keys_user_id ON app.api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON app.api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON app.api_keys(is_active) WHERE is_active = TRUE;

-- Uploads indexes
CREATE INDEX idx_uploads_user_id ON app.uploads(user_id);
CREATE INDEX idx_uploads_site_id ON app.uploads(site_id);
CREATE INDEX idx_uploads_created_at ON app.uploads(created_at);

-- Audit indexes
CREATE INDEX idx_change_log_table_name ON audit.change_log(table_name);
CREATE INDEX idx_change_log_row_id ON audit.change_log(row_id);
CREATE INDEX idx_change_log_changed_at ON audit.change_log(changed_at);

-- ================================
-- Permissions and Security
-- ================================

-- Grant schema usage
GRANT USAGE ON SCHEMA app TO sightedit_app, sightedit_readonly, sightedit_monitor;
GRANT USAGE ON SCHEMA audit TO sightedit_app, sightedit_readonly;
GRANT USAGE ON SCHEMA analytics TO sightedit_readonly, sightedit_monitor;

-- Application user permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO sightedit_app;
GRANT INSERT ON audit.change_log TO sightedit_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO sightedit_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO sightedit_app;

-- Read-only user permissions
GRANT SELECT ON ALL TABLES IN SCHEMA app TO sightedit_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO sightedit_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO sightedit_readonly;

-- Monitor user permissions (for metrics)
GRANT SELECT ON pg_stat_database TO sightedit_monitor;
GRANT SELECT ON pg_stat_user_tables TO sightedit_monitor;
GRANT SELECT ON pg_stat_statements TO sightedit_monitor;
GRANT SELECT ON pg_locks TO sightedit_monitor;
GRANT SELECT ON pg_stat_activity TO sightedit_monitor;

-- Set default permissions for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sightedit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO sightedit_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO sightedit_app;

-- ================================
-- Row Level Security (RLS)
-- ================================

-- Enable RLS on sensitive tables
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.content_edits ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY users_own_data ON app.users
    FOR ALL TO sightedit_app
    USING (id = current_setting('app.current_user_id')::UUID);

-- Sites policy - users can only access their own sites
CREATE POLICY sites_own_data ON app.sites
    FOR ALL TO sightedit_app
    USING (user_id = current_setting('app.current_user_id')::UUID);

-- Content edits policy - users can only access edits for their sites
CREATE POLICY content_edits_own_sites ON app.content_edits
    FOR ALL TO sightedit_app
    USING (site_id IN (
        SELECT id FROM app.sites 
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

-- ================================
-- Triggers for Updated_at Timestamps
-- ================================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables with updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON app.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON app.sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================
-- Audit Trigger Function
-- ================================

-- Function to log all changes
CREATE OR REPLACE FUNCTION audit.log_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit.change_log (table_name, operation, row_id, old_values, changed_at)
        VALUES (TG_TABLE_NAME, TG_OP, OLD.id, row_to_json(OLD), NOW());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit.change_log (table_name, operation, row_id, old_values, new_values, changed_at)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, row_to_json(OLD), row_to_json(NEW), NOW());
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit.change_log (table_name, operation, row_id, new_values, changed_at)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, row_to_json(NEW), NOW());
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to main tables
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON app.users
    FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

CREATE TRIGGER audit_sites AFTER INSERT OR UPDATE OR DELETE ON app.sites
    FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

CREATE TRIGGER audit_content_edits AFTER INSERT OR UPDATE OR DELETE ON app.content_edits
    FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

-- ================================
-- Initial Data
-- ================================

-- Insert default admin user (change password in production!)
INSERT INTO app.users (email, password_hash, first_name, last_name, is_active, is_verified)
VALUES (
    'admin@yourdomain.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewqbF4GUF/Lqrj9K', -- 'admin123' - CHANGE THIS
    'System',
    'Administrator',
    TRUE,
    TRUE
);

-- ================================
-- Cleanup and Maintenance Jobs
-- ================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM app.sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to archive old audit logs
CREATE OR REPLACE FUNCTION archive_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER;
BEGIN
    -- Archive logs older than 1 year to a separate table or external system
    -- For now, just delete very old logs (older than 2 years)
    DELETE FROM audit.change_log WHERE changed_at < NOW() - INTERVAL '2 years';
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- Statistics and Maintenance
-- ================================

-- Update table statistics
ANALYZE;

-- Show database size and table information
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats 
WHERE schemaname = 'app' 
ORDER BY schemaname, tablename, attname;