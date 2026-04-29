use chrono::{DateTime, Utc};
use rocksdb::DB;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;

const CACHE_TTL_SECS: i64 = 300; // 5 minutes

#[derive(Clone, Serialize, Deserialize)]
struct CacheEntry<T> {
    value: T,
    created_at: DateTime<Utc>,
}

pub struct LocalCache {
    db: Arc<DB>,
}

impl LocalCache {
    /// Open or create a RocksDB instance at the given path
    pub fn new(path: impl AsRef<Path>) -> Result<Self, Box<dyn std::error::Error>> {
        let db = DB::open_default(path)?;
        Ok(LocalCache {
            db: Arc::new(db),
        })
    }

    /// Get a value from cache if it exists and hasn't expired
    pub fn get<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Option<T> {
        match self.db.get(key.as_bytes()) {
            Ok(Some(value_bytes)) => {
                match serde_json::from_slice::<CacheEntry<T>>(&value_bytes) {
                    Ok(entry) => {
                        let elapsed = Utc::now()
                            .signed_duration_since(entry.created_at)
                            .num_seconds();
                        if elapsed < CACHE_TTL_SECS {
                            Some(entry.value)
                        } else {
                            // TTL expired, delete the key
                            let _ = self.db.delete(key.as_bytes());
                            None
                        }
                    }
                    Err(_) => None,
                }
            }
            _ => None,
        }
    }

    /// Set a value in cache with TTL
    pub fn set<T: Serialize>(
        &self,
        key: &str,
        value: T,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let entry = CacheEntry {
            value,
            created_at: Utc::now(),
        };
        let serialized = serde_json::to_vec(&entry)?;
        self.db.put(key.as_bytes(), &serialized)?;
        Ok(())
    }

    /// Delete a key from cache
    pub fn delete(&self, key: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.db.delete(key.as_bytes())?;
        Ok(())
    }

    /// Clear all entries from cache (use with caution)
    pub fn clear(&self) -> Result<(), Box<dyn std::error::Error>> {
        // RocksDB doesn't have a direct "clear all" operation, so we'd need to iterate
        // For now, this is a no-op. In production, consider recreating the DB.
        Ok(())
    }
}
