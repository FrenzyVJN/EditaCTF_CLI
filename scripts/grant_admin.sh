#!/bin/bash

# Script to grant admin access to a user
# Usage: ./scripts/grant_admin.sh <email>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <email>"
    echo "Example: $0 svijayan01@gmail.com"
    exit 1
fi

EMAIL=$1

# Load environment variables
set -a
if [ -f ".env" ]; then
    source ".env"
fi
set +a

# Extract project ref from URL
if [ -z "$SUPABASE_PROJECT_REF" ]; then
    if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ]; then
        SUPABASE_PROJECT_REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed 's|https://||' | sed 's|\.supabase\.co||')
    else
        echo "ERROR: Unable to determine Supabase project reference"
        exit 1
    fi
fi

DB_HOST="db.${SUPABASE_PROJECT_REF}.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

if [ -z "$SUPABASE_DB_PASSWORD" ]; then
    read -r -s -p "Enter Supabase DB password (postgres user): " SUPABASE_DB_PASSWORD
    echo
fi

echo "Granting admin access to: $EMAIL"
echo "Connecting to: $DB_HOST"

# SQL to grant admin access
SQL="
-- First, find the user ID for the email
DO \$\$
DECLARE
    target_user_id UUID;
BEGIN
    -- Get user ID from auth.users
    SELECT id INTO target_user_id 
    FROM auth.users 
    WHERE email = '$EMAIL';
    
    IF target_user_id IS NULL THEN
        RAISE NOTICE 'User with email $EMAIL not found. They need to sign up first.';
    ELSE
        -- Insert or update admin role (simplified for current schema)
        INSERT INTO public.user_roles (user_id, role, granted_by, is_active)
        VALUES (
            target_user_id,
            'admin',
            target_user_id, -- self-assigned for initial setup
            true
        )
        ON CONFLICT (user_id, role) 
        DO UPDATE SET 
            is_active = true,
            granted_at = NOW();
            
        RAISE NOTICE 'Admin access granted to user: $EMAIL (ID: %)', target_user_id;
    END IF;
END \$\$;

-- Show current admin users
SELECT 
    u.email,
    ur.role,
    ur.is_active,
    ur.granted_at as role_assigned
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role IN ('admin', 'super_admin')
ORDER BY ur.granted_at;
"

# Execute the SQL
echo "$SQL" | PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Admin setup completed!"
    echo ""
    echo "To access the admin panel:"
    echo "1. Make sure you're signed up at: http://localhost:3000"
    echo "2. Visit the admin page: http://localhost:3000/admin"
    echo "3. Sign in with your credentials when prompted"
    echo ""
    echo "The admin page uses the new RBAC system and will verify your admin role."
else
    echo "❌ Failed to grant admin access"
    exit 1
fi