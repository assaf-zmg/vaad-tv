#!/bin/bash
# Run this from the Vaad TV folder

set -e

# Remove broken .git if exists
rm -rf .git

# Init fresh repo
git init
git branch -M main

# Stage only the right files (no node_modules, no .env)
git add .gitignore public/ server/ start.sh

echo ""
echo "✓ Git repo initialized and files staged."
echo ""
echo "Now enter your GitHub repo URL:"
read -p "URL (e.g. https://github.com/yourname/vaad-tv.git): " REPO_URL

git remote add origin "$REPO_URL"
git commit -m "Initial commit - Vaad TV dashboard"
git push -u origin main

echo ""
echo "✓ Done! Pushed to GitHub."
