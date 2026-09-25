#!/bin/bash
# Offline Indian English female voice (Kokoro-82M v1.0, voice hf_alpha), from npm only.
set -e
cd "$(dirname "$0")"; mkdir -p kokoro; cd kokoro
[ -f package.json ] || npm init -y >/dev/null
npm install --silent kokoro-js kokoro-q8-shards
cat node_modules/kokoro-q8-shards/kokoro-q8.part{0,1,2,3,4,5}.bin > model_quantized.onnx
echo "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478  model_quantized.onnx" | sha256sum -c -
# The phoneme vocabulary ships with the sherpa-onnx Kokoro bundle.
npm pack n8n-nodes-ttsbro@0.1.6 >/dev/null && tar xzf n8n-nodes-ttsbro-0.1.6.tgz package/kokoro-int8-en-v0_19/tokens.txt \
  && mv package/kokoro-int8-en-v0_19/tokens.txt . && rm -rf package n8n-nodes-ttsbro-0.1.6.tgz
cp ../kokoro_say.mjs say.mjs
echo "Kokoro ready: $(pwd)"
