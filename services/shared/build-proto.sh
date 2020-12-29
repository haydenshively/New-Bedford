#!/bin/bash
# Run from each of the service folders with ../shared/build-protos.sh <src_folder>

BASEDIR=$(dirname "$1")

PROTO_DEST="./src/proto/"

mkdir -p ${PROTO_DEST}

# JavaScript code generation
yarn run grpc_tools_node_protoc \
    --js_out=import_style=commonjs,binary:${PROTO_DEST} \
    --grpc_out=grpc_js:${PROTO_DEST} \
    --plugin=protoc-gen-grpc=./node_modules/.bin/grpc_tools_node_protoc_plugin \
    -I ${BASEDIR} ${BASEDIR}/*.proto


# TypeScript code generation
yarn run grpc_tools_node_protoc \
    --plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts \
    --ts_out=grpc_js:${PROTO_DEST} \
    -I ${BASEDIR} ${BASEDIR}/*.proto