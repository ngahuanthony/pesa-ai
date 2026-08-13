#!/bin/bash
set -e
# Use --no-frozen-lockfile so task-agent merges that add/remove deps don't fail
pnpm install --no-frozen-lockfile
