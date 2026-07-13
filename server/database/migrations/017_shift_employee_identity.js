export const shiftEmployeeIdentityMigration = {
  name: '017_shift_employee_identity',
  sql: `
    ALTER TABLE shifts
      ADD COLUMN IF NOT EXISTS employee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

    WITH unique_names AS (
      SELECT LOWER(TRIM(name)) AS normalized_name, MIN(id) AS user_id
      FROM users
      WHERE NULLIF(TRIM(name), '') IS NOT NULL
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) = 1
    )
    UPDATE shifts AS shift
    SET employee_user_id = unique_names.user_id
    FROM unique_names
    WHERE shift.employee_user_id IS NULL
      AND shift.employee_name IS NOT NULL
      AND LOWER(TRIM(shift.employee_name)) = unique_names.normalized_name;

    CREATE INDEX IF NOT EXISTS idx_shifts_employee_user_date
      ON shifts(employee_user_id, date DESC)
      WHERE deleted_at IS NULL;
  `,
}
