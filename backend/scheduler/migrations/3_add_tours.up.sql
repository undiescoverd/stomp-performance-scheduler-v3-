-- Add tours table for managing tour bulk creation
CREATE TABLE tours (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  segment_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  cast_member_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add tour tracking columns to existing schedules table
ALTER TABLE schedules 
ADD COLUMN tour_id TEXT REFERENCES tours(id) ON DELETE CASCADE,
ADD COLUMN tour_segment TEXT;

-- Create indexes for performance
CREATE INDEX idx_tours_start_date ON tours(start_date);
CREATE INDEX idx_tours_end_date ON tours(end_date);
CREATE INDEX idx_tours_created_at ON tours(created_at DESC);
CREATE INDEX idx_schedules_tour_id ON schedules(tour_id);
CREATE INDEX idx_schedules_tour_segment ON schedules(tour_segment);

-- Create view for tour overview with week count
CREATE VIEW tour_overview AS
SELECT 
  t.id,
  t.name,
  t.segment_name,
  t.start_date,
  t.end_date,
  t.cast_member_ids,
  t.created_at,
  t.updated_at,
  COUNT(s.id) as week_count,
  ARRAY_AGG(
    JSON_BUILD_OBJECT(
      'id', s.id,
      'location', s.location,
      'week', s.week,
      'tour_segment', s.tour_segment
    ) ORDER BY s.week
  ) FILTER (WHERE s.id IS NOT NULL) as weeks
FROM tours t
LEFT JOIN schedules s ON t.id = s.tour_id
GROUP BY t.id, t.name, t.segment_name, t.start_date, t.end_date, t.cast_member_ids, t.created_at, t.updated_at;