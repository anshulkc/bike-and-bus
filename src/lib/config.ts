// Tuning constants for the bike swap algorithm. Adjust from real-world feel
// without touching algorithm logic.

// Walk legs shorter than this stay as walk — the overhead of mounting/locking
// a bike is not worth shaving a few seconds off a short walk.
export const WALK_THRESHOLD_SEC = 180

// Per-swapped-leg overhead added to bike duration before comparing with walk.
// Models unlock + mount at start, lock + dismount at end. Tunable:
//   - Personal bike in a rack: ~60s
//   - Bike-share with app-based unlock: ~180s
// Default targets personal-bike use.
export const BIKE_OVERHEAD_SEC = 60

// Candidate routes with a bike leg exceeding any of these are dropped.
// Protects against absurd suggestions like biking 8 miles to catch a bus.
export const MAX_BIKE_MIN = 20
export const MAX_BIKE_MILES = 4

// Conversion used for MAX_BIKE_MILES check.
export const METERS_PER_MILE = 1609.344
