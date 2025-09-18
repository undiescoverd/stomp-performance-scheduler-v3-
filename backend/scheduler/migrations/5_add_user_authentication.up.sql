-- Add user_id column for authentication and data isolation

-- Add user_id to schedules table
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'system';

-- Add user_id to tours table
ALTER TABLE tours ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'system';

-- Create indexes for performance on user_id columns
CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_tours_user_id ON tours(user_id);

-- Update the tour_overview view to include user_id filtering
DROP VIEW IF EXISTS tour_overview;
CREATE VIEW tour_overview AS
SELECT 
  t.id,
  t.name,
  t.segment_name,
  t.start_date,
  t.end_date,
  t.cast_member_ids,
  t.user_id,
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
LEFT JOIN schedules s ON t.id = s.tour_id AND t.user_id = s.user_id
GROUP BY t.id, t.name, t.segment_name, t.start_date, t.end_date, t.cast_member_ids, t.user_id, t.created_at, t.updated_at;

-- Create composite index for tours filtering
CREATE INDEX IF NOT EXISTS idx_tours_user_date ON tours(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_schedules_user_created ON schedules(user_id, created_at DESC);