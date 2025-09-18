#!/bin/bash

# CTF Database Migration Script
# Runs all SQL scripts except 005_seed.sql against local Supabase
# Usage: ./run_migration_dev.sh [database_url]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default Supabase local database URL
DEFAULT_DB_URL="postgresql://postgres:miniEditaCTF@localhost:8000/postgres"

# Use provided URL or default
DB_URL="${1:-$DEFAULT_DB_URL}"

echo -e "${BLUE}🚀 Starting CTF Database Migration${NC}"
echo -e "${BLUE}Database URL: ${DB_URL}${NC}"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ Error: psql is not installed or not in PATH${NC}"
    echo "Please install PostgreSQL client tools"
    exit 1
fi

# Test database connection
echo -e "${YELLOW}🔌 Testing database connection...${NC}"
if ! psql "$DB_URL" -c "SELECT 1;" &> /dev/null; then
    echo -e "${RED}❌ Error: Cannot connect to database${NC}"
    echo "Please ensure your local Supabase is running and the connection URL is correct"
    echo "Try: supabase start"
    exit 1
fi
echo -e "${GREEN}✅ Database connection successful${NC}"
echo ""

# List of SQL files to run (excluding 005_seed.sql)
SQL_FILES=(
    "001_init.sql"
    "002_core.sql" 
    "003_policies.sql"
    "004_realtime.sql"
    "006_fix_all.sql"
    "007_teams.sql"
    "008_views_current_team.sql"
    "009_team_dedup.sql"
    "010_fix_team_dedup.sql"
    "011_admin_improvements.sql"
    "012_filter_guests.sql"
    "013_unique_display_names.sql"
    "014_hide_guest_teams.sql"
)

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}📋 Migration Plan:${NC}"
for file in "${SQL_FILES[@]}"; do
    if [[ -f "$SCRIPT_DIR/$file" ]]; then
        echo -e "  ✓ $file"
    else
        echo -e "  ${RED}✗ $file (missing)${NC}"
    fi
done
echo -e "${YELLOW}  ⚠️  005_seed.sql (skipped - contains sample data)${NC}"
echo ""

# Confirm before proceeding
read -p "Continue with migration? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Migration cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}🔄 Starting migration...${NC}"

# Track success/failure
SUCCESSFUL=()
FAILED=()

# Run each SQL file
for file in "${SQL_FILES[@]}"; do
    file_path="$SCRIPT_DIR/$file"
    
    if [[ ! -f "$file_path" ]]; then
        echo -e "${RED}❌ File not found: $file${NC}"
        FAILED+=("$file")
        continue
    fi
    
    echo -e "${YELLOW}📄 Running: $file${NC}"
    
    if psql "$DB_URL" -f "$file_path" -v ON_ERROR_STOP=1 &> /tmp/migration_output.log; then
        echo -e "${GREEN}✅ Success: $file${NC}"
        SUCCESSFUL+=("$file")
    else
        echo -e "${RED}❌ Failed: $file${NC}"
        echo -e "${RED}Error output:${NC}"
        cat /tmp/migration_output.log
        FAILED+=("$file")
        
        # Ask if user wants to continue
        echo ""
        read -p "Continue with remaining migrations? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            break
        fi
    fi
    echo ""
done

# Summary
echo -e "${BLUE}📊 Migration Summary:${NC}"
echo -e "${GREEN}✅ Successful (${#SUCCESSFUL[@]}):${NC}"
for file in "${SUCCESSFUL[@]}"; do
    echo "  - $file"
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo -e "${RED}❌ Failed (${#FAILED[@]}):${NC}"
    for file in "${FAILED[@]}"; do
        echo "  - $file"
    done
fi

echo ""
if [[ ${#FAILED[@]} -eq 0 ]]; then
    echo -e "${GREEN}🎉 All migrations completed successfully!${NC}"
    echo -e "${BLUE}💡 Next steps:${NC}"
    echo "  - Your CTF database is ready"
    echo "  - Add your own challenges using the challenges table"
    echo "  - Add corresponding flags to challenge_flags table"
    echo "  - Use 005_seed.sql as a reference for data format"
else
    echo -e "${YELLOW}⚠️  Some migrations failed. Please review and fix issues.${NC}"
    exit 1
fi

# Clean up
rm -f /tmp/migration_output.log