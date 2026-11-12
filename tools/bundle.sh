#!/bin/sh
# Builds a single-file Apps Script bundle (paste into one file named Code.gs). Output: dist/Code.gs
mkdir -p dist
{ for f in Engine Store Setup Code; do echo "/* ===== $f.gs ===== */"; cat apps-script/$f.gs; echo; done; } > dist/Code.gs
echo "dist/Code.gs built"
