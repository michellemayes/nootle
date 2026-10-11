//! End-to-end checks against the real ML models. They need the models
//! downloaded (Nootle's data dir, or XDG_DATA_HOME on Linux pointing at a
//! folder with Nootle/models), so they are ignored by default:
//!
//!     cargo test --test models_test -- --ignored

use nootle_app_lib::embedding::EmbeddingEngine;

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[test]
#[ignore = "needs the search model downloaded"]
fn embeddings_rank_paraphrases_above_unrelated_text() {
    let mut engine = EmbeddingEngine::load().expect("search model");
    let question = engine.embed("When is the Q3 budget due?").unwrap();
    let answer = engine
        .embed("Priya said the third-quarter budget has to be final by October 15.")
        .unwrap();
    let unrelated = engine
        .embed("We spent the rest of the call talking about the offsite in Lisbon.")
        .unwrap();
    let (relevant, noise) = (cosine(&question, &answer), cosine(&question, &unrelated));
    assert!(
        relevant > noise + 0.1,
        "relevant {relevant:.3} should clearly beat unrelated {noise:.3}"
    );
}
