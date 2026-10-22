#!/bin/bash
# Downloads the models the golden tests (src-tauri/tests/models_test.rs) run
# against into $1/Nootle/models, verifying each file's SHA-256 against the
# hashes pinned in src-tauri/src/model_registry.rs. Point XDG_DATA_HOME at $1
# when running the tests on Linux.
set -euo pipefail

root="${1:?usage: fetch-test-models.sh <data-dir>}"
models="$root/Nootle/models"
hf=https://huggingface.co

fetch() {
  local dir="$models/$1" name="$2" url="$3" sha="$4"
  mkdir -p "$dir"
  if [ -f "$dir/$name" ] && echo "$sha  $dir/$name" | sha256sum -c --status; then
    return
  fi
  # Abort a download that stalls below 100 KB/s for a minute; --retry tries again.
  curl -sSfL --retry 3 --connect-timeout 30 --speed-limit 100000 --speed-time 60 -o "$dir/$name.part" "$url"
  echo "$sha  $dir/$name.part" | sha256sum -c --quiet
  mv "$dir/$name.part" "$dir/$name"
}

p=$hf/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main
fetch parakeet-tdt-0.6b-v3 encoder.onnx "$p/encoder-model.int8.onnx" 6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09
fetch parakeet-tdt-0.6b-v3 decoder.onnx "$p/decoder_joint-model.int8.onnx" eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70
fetch parakeet-tdt-0.6b-v3 vocab.txt "$p/vocab.txt" d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d
fetch parakeet-tdt-0.6b-v3 nemo128.onnx "$p/nemo128.onnx" a9fde1486ebfcc08f328d75ad4610c67835fea58c73ba57e3209a6f6cf019e9f
fetch diarization segmentation.onnx "$hf/onnx-community/pyannote-segmentation-3.0/resolve/main/onnx/model.onnx" 057ee564753071c0b09b5b611648b50ac188d50846bff5f01e9f7bbf1591ea25
fetch diarization embedding.onnx "$hf/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/main/voxceleb_resnet34_LM.onnx" 7bb2f06e9df17cdf1ef14ee8a15ab08ed28e8d0ef5054ee135741560df2ec068
fetch embedding-minilm model.onnx "$hf/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx" 6fd5d72fe4589f189f8ebc006442dbb529bb7ce38f8082112682524616046452
fetch embedding-minilm vocab.txt "$hf/sentence-transformers/all-MiniLM-L6-v2/resolve/main/vocab.txt" 07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3
fetch parakeet-tdt-0.6b-v3 silero_vad.onnx "$hf/onnx-community/silero-vad/resolve/main/onnx/model.onnx" a4a068cd6cf1ea8355b84327595838ca748ec29a25bc91fc82e6c299ccdc5808
echo "Models ready in $models"
