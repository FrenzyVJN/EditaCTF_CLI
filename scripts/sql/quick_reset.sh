#!/bin/bash

# CTF Database Quick Reset Script (No Confirmations)
# For development/testing use only - DANGEROUS!
# Usage: ./quick_reset.sh [database_url]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default Supabase local database URL
DEFAULT_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"

# Use provided URL or default
DB_URL="${1:-$DEFAULT_DB_URL}"

echo -e "${RED}🔥 QUICK RESET - NO CONFIRMATIONS!${NC}"
echo -e "${BLUE}Database URL: ${DB_URL}${NC}"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ Error: psql is not installed${NC}"
    exit 1
fi

# Test database connection
if ! psql "$DB_URL" -c "SELECT 1;" &> /dev/null; then
    echo -e "${RED}❌ Error: Cannot connect to database${NC}"
    exit 1
fi

echo -e "${YELLOW}🔄 Running reset...${NC}"

# Run the reset directly
if psql "$DB_URL" -f reset_database.sql -v ON_ERROR_STOP=1 > /tmp/reset_output.log 2>&1; then
    echo -e "${GREEN}✅ Reset completed successfully!${NC}"
    echo -e "${BLUE}💡 Run ./run_migrations.sh to recreate the database${NC}"
else
    echo -e "${RED}❌ Reset failed!${NC}"
    cat /tmp/reset_output.log
    exit 1
fi

rm -f /tmp/reset_output.log
