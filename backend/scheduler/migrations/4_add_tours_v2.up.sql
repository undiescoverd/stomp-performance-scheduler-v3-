-- Drop existing tables if needed to restructure
DROP VIEW IF EXISTS tour_overview;
DROP TABLE IF EXISTS tours CASCADE;

-- Create tours table with better structure
CREATE TABLE IF NOT EXISTS tours (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL, -- e.g., "European Summer Tour 2025"
    segment_name TEXT NOT NULL, -- e.g., "France", "Spain"
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    cast_member_ids JSONB NOT NULL,
    parent_tour_name TEXT, -- For grouping segments together
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add location field to schedules for city names
ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS location_city TEXT;

-- Add tour fields to schedules
ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS tour_id TEXT REFERENCES tours(id) ON DELETE CASCADE;
ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS tour_segment TEXT;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_tours_parent ON tours(parent_tour_name);
CREATE INDEX IF NOT EXISTS idx_schedules_tour_id ON schedules(tour_id);
CREATE INDEX IF NOT EXISTS idx_tours_date_range ON tours(start_date, end_date);

-- Create view for tour overview with grouping
CREATE OR REPLACE VIEW tour_overview AS
SELECT 
    t.id,
    t.parent_tour_name,
    t.name,
    t.segment_name,
    t.start_date,
    t.end_date,
    COUNT(DISTINCT s.id) as total_weeks,
    jsonb_array_length(t.cast_member_ids) as cast_count,
    t.created_at
FROM tours t
LEFT JOIN schedules s ON s.tour_id = t.id
GROUP BY t.id;