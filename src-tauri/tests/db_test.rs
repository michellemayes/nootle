use nootle_app_lib::db::Database;

#[test]
fn test_database_initializes_tables() {
    let db = Database::new_in_memory().unwrap();
    let tables = db.list_tables().unwrap();
    assert!(tables.contains(&"meetings".to_string()));
    assert!(tables.contains(&"transcripts".to_string()));
    assert!(tables.contains(&"summaries".to_string()));
    assert!(tables.contains(&"categories".to_string()));
    assert!(tables.contains(&"templates".to_string()));
    assert!(tables.contains(&"prompts".to_string()));
}
